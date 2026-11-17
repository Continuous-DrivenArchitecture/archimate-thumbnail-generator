import { cp, lstat, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const artifactRoot = path.resolve(process.env.ARTIFACT_DIR ?? 'artifact');
const outputRoot = path.resolve('dist');
const runId = String(process.env.SOURCE_RUN_ID ?? '');
const issueNumber = Number(process.env.SOURCE_ISSUE_NUMBER);
const checkNoSymlinks = async (directory) => {
  for (const name of await (await import('node:fs/promises')).readdir(directory)) {
    const entry = path.join(directory, name);
    const details = await lstat(entry);
    if (details.isSymbolicLink()) throw new Error('Artifact contains a symbolic link');
    if (details.isDirectory()) await checkNoSymlinks(entry);
    else if (!details.isFile()) throw new Error('Artifact contains a non-regular file');
  }
};
await checkNoSymlinks(artifactRoot);
const resultPath = path.join(artifactRoot, 'result.json');
const resultStat = await lstat(resultPath);
if (!resultStat.isFile() || resultStat.size > 64 * 1024) throw new Error('Processing status file is invalid');
const emit = async ({ success, summary = {} }) => {
  const output = process.env.GITHUB_OUTPUT;
  if (output) await writeFile(output, `success=${success}\nsummary=${JSON.stringify(summary)}\n`, { flag: 'a' });
};
let result;
try { result = JSON.parse(await readFile(resultPath, 'utf8')); }
catch { await emit({ success: false, summary: { reason: 'Processing artifact is missing or invalid' } }); process.exit(0); }
if (!/^[0-9]+$/.test(runId) || result.runId !== runId || Number(result.issueNumber) !== issueNumber) throw new Error('Artifact run or issue metadata does not match the trusted workflow event');

if (typeof result.success !== 'boolean') throw new Error('Processing status is invalid');
if (!result.success) {
  const summary = { stage: result.stage, reason: String(result.reason ?? 'Processing failed').slice(0, 300) };
  await emit({ success: false, summary });
  console.log(JSON.stringify({ success: false, ...summary }));
  process.exit(0);
}

const manifestPath = path.join(artifactRoot, 'manifest.json');
if ((await lstat(manifestPath)).size > 5 * 1024 * 1024) throw new Error('Manifest exceeds the allowed size');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (String(manifest.runId) !== runId || Number(manifest.issueNumber) !== issueNumber || !Array.isArray(manifest.views) || manifest.views.length === 0) throw new Error('Manifest metadata does not match the trusted workflow event');
if (typeof manifest.modelName !== 'string' || manifest.modelName.length > 200 || !/^[a-f0-9]{64}$/.test(manifest.modelSha256) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(manifest.timestampUtc)) throw new Error('Manifest model metadata is invalid');
if (!Number.isInteger(manifest.viewsDetected) || manifest.viewsDetected !== manifest.views.length || manifest.viewsDetected > 100 || manifest.thumbnailsGenerated !== manifest.views.length || manifest.errorCount !== 0 || !Array.isArray(manifest.errors) || manifest.errors.length !== 0) throw new Error('Manifest counts are inconsistent');
if (manifest.versions?.archiRuntime !== '0.1.0' || manifest.versions?.archi !== '5.11.0' || manifest.versions?.coArchi !== '0.9.8') throw new Error('Manifest tool versions are unexpected');
await mkdir(outputRoot, { recursive: true });
const manifestName = `issue${issueNumber}-run${runId}-manifest.json`;
const targetManifest = path.join(outputRoot, manifestName);
const expectedStamp = manifest.timestampUtc.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-');
const seenIds = new Set();
const seenFiles = new Set();
for (const view of manifest.views) {
  if (typeof view.name !== 'string' || !view.name || view.name.length > 500 || typeof view.id !== 'string' || !view.id || view.id.length > 256) throw new Error('Manifest view metadata is invalid');
  if (seenIds.has(view.id) || typeof view.file !== 'string' || !new RegExp(`^${expectedStamp}-issue${issueNumber}-[a-z0-9-]+\\.png$`).test(view.file) || seenFiles.has(view.file)) throw new Error('Manifest contains duplicate or unsafe view output');
  seenIds.add(view.id); seenFiles.add(view.file);
}
const topEntries = (await (await import('node:fs/promises')).readdir(artifactRoot)).sort();
if (JSON.stringify(topEntries) !== JSON.stringify(['images', 'manifest.json', 'result.json'])) throw new Error('Artifact contains unexpected top-level files');
const imageEntries = (await (await import('node:fs/promises')).readdir(path.join(artifactRoot, 'images'))).sort();
if (JSON.stringify(imageEntries) !== JSON.stringify([...seenFiles].sort())) throw new Error('Artifact image files do not match the manifest');
try {
  const priorInfo = await lstat(targetManifest);
  if (!priorInfo.isFile() || priorInfo.isSymbolicLink()) throw new Error('Previously published manifest is not a regular file');
  const prior = JSON.parse(await readFile(targetManifest, 'utf8'));
  if (Number(prior.issueNumber) !== issueNumber || String(prior.runId) !== runId || prior.modelSha256 !== manifest.modelSha256 || !Array.isArray(prior.views) || prior.views.length !== manifest.views.length || prior.errorCount !== 0 || prior.thumbnailsGenerated !== prior.viewsDetected) {
    throw new Error('This run ID already has different published results; refusing to duplicate or overwrite them');
  }
  const priorFiles = prior.views.map(view => view.file);
  for (const filename of priorFiles) {
    if (typeof filename !== 'string' || path.basename(filename) !== filename || !/^\d{8}-\d{6}-issue\d+-[a-z0-9-]+\.png$/.test(filename)) throw new Error('Previously published manifest contains an unsafe filename');
    const fileInfo = await lstat(path.join(outputRoot, filename));
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) throw new Error('Previously published image is not a regular file');
    const persisted = await sharp(path.join(outputRoot, filename), { failOn: 'error' }).metadata();
    if (persisted.format !== 'png') throw new Error(`Previously published output is invalid: ${filename}`);
  }
  const summary = { files: priorFiles, views: prior.views.map(({ name, file }) => ({ name, file })), manifest: manifestName, viewsDetected: prior.viewsDetected, thumbnailsGenerated: prior.thumbnailsGenerated, modelName: prior.modelName, timestampUtc: prior.timestampUtc };
  await emit({ success: true, summary });
  console.log(JSON.stringify({ success: true, idempotent: true, ...summary }));
  process.exit(0);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const files = [];
let totalOutputBytes = 0;
for (const view of manifest.views) {
  if (path.basename(view.file) !== view.file) throw new Error('Manifest contains an unsafe output filename');
  const source = path.resolve(artifactRoot, 'images', view.file);
  if (!source.startsWith(`${path.resolve(artifactRoot, 'images')}${path.sep}`)) throw new Error('Artifact path escapes the images directory');
  const imageStat = await lstat(source);
  if (imageStat.isSymbolicLink()) throw new Error('Artifact image must not be a symbolic link');
  if (!imageStat.isFile() || imageStat.size < 100 || imageStat.size > 25 * 1024 * 1024) throw new Error(`Invalid image artifact: ${view.file}`);
  totalOutputBytes += imageStat.size;
  if (totalOutputBytes > 500 * 1024 * 1024) throw new Error('Generated images exceed the publication size limit');
  const image = await sharp(source, { failOn: 'error' }).metadata();
  if (image.format !== 'png' || !image.width || !image.height) throw new Error(`Artifact is not a decodable PNG: ${view.file}`);
  const target = path.join(outputRoot, view.file);
  try {
    const existing = await readFile(target);
    const incoming = await readFile(source);
    if (!existing.equals(incoming)) throw new Error(`Refusing to overwrite existing result ${view.file}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await cp(source, target, { errorOnExist: true, force: false });
  }
  files.push(view.file);
}
try {
  const existing = await readFile(targetManifest);
  if (!existing.equals(await readFile(path.join(artifactRoot, 'manifest.json')))) throw new Error(`Refusing to overwrite existing manifest ${manifestName}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await cp(path.join(artifactRoot, 'manifest.json'), targetManifest, { errorOnExist: true, force: false });
}
const summary = { files, views: manifest.views.map(({ name, file }) => ({ name, file })), manifest: manifestName, viewsDetected: manifest.viewsDetected, thumbnailsGenerated: manifest.thumbnailsGenerated, modelName: manifest.modelName, timestampUtc: manifest.timestampUtc };
await emit({ success: true, summary });
console.log(JSON.stringify({ success: true, ...summary }));
