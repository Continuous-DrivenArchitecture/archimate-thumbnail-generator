import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createManifest } from '../../src/manifest-generator.js';

test('records model digest, execution identifiers, versions and per-view results', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-manifest-'));
  try {
    const modelPath = path.join(directory, 'model.archimate');
    await writeFile(modelPath, 'model bytes');
    const manifest = await createManifest({
      issueNumber: 42, runId: '123456', timestamp: '2026-11-17T03:30:00Z', modelName: 'Architecture Model', modelPath,
      views: [{ name: 'Business View', id: 'abc123', file: '20261117-033000-issue42-business-view-abc123.png' }],
      errors: [], versions: { archi: '5.11.0', coArchi: '0.9.8' }
    });
    assert.equal(manifest.timestampUtc, '2026-11-17T03:30:00.000Z');
    assert.equal(manifest.viewsDetected, 1);
    assert.equal(manifest.thumbnailsGenerated, 1);
    assert.match(manifest.modelSha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.views[0].id, 'abc123');
    assert.equal(manifest.versions.archiRuntime, '0.1.0');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
