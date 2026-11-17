import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIssue } from './issue-parser.js';
import { downloadAndExtractModel } from './attachment-downloader.js';
import { runArchi } from './archi-processor.js';
import { extractViews } from './view-extractor.js';
import { createThumbnail } from './thumbnail-generator.js';
import { createManifest } from './manifest-generator.js';
import { viewOutputFilename } from './output-naming.js';
import { removeIsolatedTempDirectory } from './temp-cleanup.js';

export async function processIssue({ issue, runId, outputDirectory, timestamp = new Date() }) {
  const temp = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(tmpdir(), 'archimate-job-')));
  const workspace = path.join(temp, 'workspace');
  const output = path.join(temp, 'output');
  const artifacts = path.resolve(outputDirectory);
  let stage = 'issue';
  try {
    await Promise.all([mkdir(workspace, { mode: 0o700 }), mkdir(output, { mode: 0o700 }), mkdir(path.join(artifacts, 'images'), { recursive: true })]);
    if (process.platform === 'linux') {
      // The pinned Archi image runs as UID 10001, not as the Actions runner user.
      // These random per-run mounts contain only the untrusted model and report.
      await Promise.all([chmod(temp, 0o755), chmod(workspace, 0o777), chmod(output, 0o777)]);
    }
    const input = parseIssue(issue.body);
    stage = 'download';
    const limits = {
      maxZipBytes: boundedLimit('MAX_ZIP_BYTES', 25 * 1024 * 1024, 1024, 100 * 1024 * 1024),
      maxUncompressedBytes: boundedLimit('MAX_UNCOMPRESSED_BYTES', 100 * 1024 * 1024, 1024, 1024 * 1024 * 1024),
      maxEntries: boundedLimit('MAX_ARCHIVE_ENTRIES', 500, 1, 10_000),
      maxViews: boundedLimit('MAX_VIEWS', 100, 1, 100),
      maxOutputBytes: boundedLimit('MAX_OUTPUT_BYTES', 500 * 1024 * 1024, 1024, 2 * 1024 * 1024 * 1024)
    };
    const model = await downloadAndExtractModel(input.attachmentUrl, workspace, limits);
    stage = 'archi';
    const archiResult = await runArchi(model.modelPath, workspace, output, { timeout: boundedLimit('ARCHI_TIMEOUT_MS', 240_000, 10_000, 600_000) });
    stage = 'extract';
    const views = await extractViews(path.join(output, 'report'), { maxViews: limits.maxViews });
    if (views.length !== model.viewCount) throw new Error(`Model contains ${model.viewCount} views, but report exported ${views.length}`);
    stage = 'thumbnail';
    const records = [];
    const errors = [];
    const usedNames = new Set();
    let generatedBytes = 0;
    for (const view of views) {
      const file = viewOutputFilename({ issueNumber: issue.number, timestamp, name: view.name, id: view.reportId }, usedNames);
      try {
        const thumbnail = await createThumbnail(view.imagePath, path.join(artifacts, 'images', file), { maxDimension: boundedLimit('MAX_THUMBNAIL_DIMENSION', 1200, 64, 4096) });
        generatedBytes += thumbnail.bytes;
        if (generatedBytes > limits.maxOutputBytes) throw new Error('Generated thumbnails exceed the configured output size limit');
        records.push({ name: view.name, id: view.reportId, file });
      } catch (error) {
        const reason = safeReason(error.message);
        errors.push({ viewId: view.reportId, reason });
        records.push({ name: view.name, id: view.reportId, file: null, error: reason });
      }
    }
    const manifest = await createManifest({
      issueNumber: issue.number, runId, timestamp, modelName: input.modelName,
      modelPath: model.modelPath, views: records, errors, versions: { archi: '5.11.0', coArchi: '0.9.8' }
    });
    await writeFile(path.join(artifacts, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    if (errors.length) throw Object.assign(new Error(`${errors.length} view thumbnail(s) could not be generated`), { stage: 'thumbnail' });
    await writeFile(path.join(artifacts, 'result.json'), JSON.stringify({ success: true, issueNumber: issue.number, runId: String(runId) }), { mode: 0o600 });
    return { manifest, archi: { stdout: archiResult.stdout, stderr: archiResult.stderr } };
  } catch (error) {
    await writeFile(path.join(artifacts, 'result.json'), JSON.stringify({ success: false, issueNumber: issue.number, runId: String(runId), stage: error.stage ?? stage, reason: safeReason(error.message) }), { mode: 0o600 });
    throw error;
  } finally {
    await removeIsolatedTempDirectory(temp);
  }
}

const safeReason = (value = 'Processing failed') => String(value).replace(/https?:\/\/\S+/g, '[URL]').replace(/[\r\n\t]+/g, ' ').slice(0, 300);
function boundedLimit(key, fallback, min, max) {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  try {
    const { manifest } = await processIssue({ issue: event.issue, runId: process.env.GITHUB_RUN_ID, outputDirectory: process.env.ARTIFACT_DIR ?? 'artifacts' });
    console.log(`Generated ${manifest.thumbnailsGenerated} thumbnails for issue #${event.issue.number}`);
  } catch (error) {
    console.error(`Processing failed at ${error.stage ?? 'unknown'}: ${safeReason(error.message)}`);
    process.exitCode = 1;
  }
}
