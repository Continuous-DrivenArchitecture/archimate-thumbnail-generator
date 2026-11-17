import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function createManifest({ issueNumber, runId, timestamp, modelName, modelPath, views, detectedViewCount, errors = [], versions }) {
  const modelSha256 = createHash('sha256').update(await readFile(modelPath)).digest('hex');
  return {
    issueNumber, runId: String(runId), timestampUtc: new Date(timestamp).toISOString(), modelName, modelSha256,
    viewsDetected: detectedViewCount ?? views.length, thumbnailsGenerated: views.filter((view) => view.file).length, errorCount: errors.length,
    views: views.map(({ name, id, file, error }) => ({ name, id, file: file ?? null, error: error ?? null })),
    errors, versions: { archiRuntime: '0.1.0', archi: versions.archi, coArchi: versions.coArchi }
  };
}
