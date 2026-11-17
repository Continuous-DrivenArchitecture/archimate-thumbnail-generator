import { createWriteStream } from 'node:fs';
import { chmod, mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { validateAttachmentUrl } from './issue-parser.js';
import { validateArchiMateModel } from './model-validator.js';

const redirectHosts = new Set(['github.com', 'user-images.githubusercontent.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'github-production-user-asset-6210df.s3.amazonaws.com']);
const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

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
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('ZIP exceeds the configured download limit');
  let total = 0;
  const limiter = new TransformStream({ transform(chunk, controller) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error('ZIP exceeds the configured download limit');
    controller.enqueue(chunk);
  }});
  const file = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  await pipeline(response.body.pipeThrough(limiter), file);
  if (total < 4) throw new Error('Downloaded file is not a ZIP archive');
  const handle = await open(destination, 'r');
  try { const signature = Buffer.alloc(4); await handle.read(signature, 0, 4, 0); if (!signature.equals(zipSignature)) throw new Error('Downloaded file is not a ZIP archive'); }
  finally { await handle.close(); }
}

function readZip(file) {
  return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, autoClose: false }, (error, zip) => error ? reject(error) : resolve(zip)));
}

export async function extractModelZip(zipPath, directory, limits = {}) {
  const maxUncompressedBytes = limits.maxUncompressedBytes ?? 100 * 1024 * 1024;
  const maxEntries = limits.maxEntries ?? 500;
  const root = path.resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const zip = await readZip(zipPath);
  try {
    const files = [];
    let entryCount = 0;
    let totalSize = 0;
    await new Promise((resolve, reject) => {
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        entryCount++;
        totalSize += entry.uncompressedSize;
        const name = entry.fileName;
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        const unixType = mode & 0xf000;
        if (entryCount > maxEntries || totalSize > maxUncompressedBytes) return reject(new Error('ZIP exceeds configured extraction limits'));
        if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || name.includes('\0')) return reject(new Error('ZIP contains an unsafe path'));
        if (unixType === 0xa000) return reject(new Error('ZIP symbolic links are not permitted'));
        if (unixType !== 0 && unixType !== 0x8000) return reject(new Error('ZIP contains a non-regular file'));
        if (name.endsWith('/')) return reject(new Error('Unexpected directory entry in ZIP'));
        files.push({ name, entry });
        zip.readEntry();
      });
      zip.on('end', resolve);
      zip.readEntry();
    });
    const models = files.filter(({ name }) => name.toLowerCase().endsWith('.archimate'));
    if (files.length !== 1 || models.length !== 1) throw new Error('ZIP must contain exactly one .archimate model and no other files');
    const target = path.join(root, 'model.archimate');
    const stream = await new Promise((resolve, reject) => zip.openReadStream(models[0].entry, (error, result) => error ? reject(error) : resolve(result)));
    let written = 0;
    const guard = new TransformStream({ transform(chunk, controller) { written += chunk.byteLength; if (written > maxUncompressedBytes) throw new Error('Model exceeds the configured size limit'); controller.enqueue(chunk); } });
    await pipeline(stream, guard, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
    await chmod(target, 0o644);
    const xml = await readFile(target, 'utf8');
    const model = validateArchiMateModel(xml);
    if (model.viewCount > (limits.maxViews ?? 500)) throw new Error('Model exceeds the configured view limit');
    return { modelPath: target, ...model };
  } finally { zip.close(); }
}

export async function downloadAndExtractModel(attachmentUrl, directory, limits = {}) {
  const maxZipBytes = limits.maxZipBytes ?? 25 * 1024 * 1024;
  const root = path.resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const zipPath = path.join(root, 'upload.zip');
  try {
    await download(validateAttachmentUrl(attachmentUrl), zipPath, maxZipBytes);
    return await extractModelZip(zipPath, root, limits);
  } finally { await rm(zipPath, { force: true }); }
}
