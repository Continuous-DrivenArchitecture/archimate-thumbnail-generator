import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { validateAttachmentUrl } from './issue-parser.js';
import { validateArchiMateModel } from './model-validator.js';

const redirectHosts = new Set(['github.com', 'user-images.githubusercontent.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'github-production-user-asset-6210df.s3.amazonaws.com']);

async function download(url, destination, maxBytes, redirects = 0) {
  if (redirects > 3) throw new Error('Too many attachment redirects');
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Attachment redirect did not include a destination');
    const next = new URL(location, url);
    if (next.protocol !== 'https:' || !redirectHosts.has(next.hostname) || next.username || next.password || (next.port && next.port !== '443')) throw new Error('Attachment redirected to a disallowed host');
    await response.body?.cancel();
    return download(next, destination, maxBytes, redirects + 1);
  }
  if (!response.ok || !response.body) throw new Error(`Attachment download failed (HTTP ${response.status})`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('Model exceeds the configured download size limit');
  let total = 0;
  const limiter = new TransformStream({ transform(chunk, controller) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error('Model exceeds the configured download size limit');
    controller.enqueue(chunk);
  }});
  await pipeline(response.body.pipeThrough(limiter), createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  if (total === 0) throw new Error('Downloaded model is empty');
}

export async function downloadModel(attachmentUrl, directory, limits = {}) {
  const maxModelBytes = limits.maxModelBytes ?? 100 * 1024 * 1024;
  const root = path.resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const modelPath = path.join(root, 'model.archimate');
  try {
    await download(validateAttachmentUrl(attachmentUrl), modelPath, maxModelBytes);
    await chmod(modelPath, 0o644);
    const xml = await readFile(modelPath, 'utf8');
    const model = validateArchiMateModel(xml);
    if (model.viewCount > (limits.maxViews ?? 100)) throw new Error('Model exceeds the configured view limit');
    return { modelPath, ...model };
  } catch (error) {
    await rm(modelPath, { force: true });
    throw error;
  }
}
