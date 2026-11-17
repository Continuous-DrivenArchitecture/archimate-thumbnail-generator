import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { createManifest } from '../../src/manifest-generator.js';

test('publishing the same workflow run twice does not duplicate or overwrite results', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'archimate-publish-'));
  try {
    const artifact = path.join(root, 'artifact');
    const imageDir = path.join(artifact, 'images');
    await mkdir(imageDir, { recursive: true });
    const file = '20261117-033000-issue42-business-view-a1b2c3.png';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="white"/><rect x="20" y="20" width="120" height="60" fill="#ddf" stroke="#222"/><text x="30" y="55">Business view</text></svg>';
    await sharp(Buffer.from(svg)).png().toFile(path.join(imageDir, file));
    const modelPath = fileURLToPath(new URL('../fixtures/three-views.archimate.txt', import.meta.url));
    const manifest = await createManifest({
      issueNumber: 42, runId: '123456', timestamp: '2026-11-17T03:30:00Z', modelName: 'Test model', modelPath,
      views: [{ name: 'Business View', id: 'a1b2c3', file }], detectedViewCount: 1,
      versions: { archi: '5.11.0', coArchi: '0.9.8' }
    });
    await writeFile(path.join(artifact, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(artifact, 'result.json'), JSON.stringify({ success: true, issueNumber: 42, runId: '123456' }));
    const script = fileURLToPath(new URL('../../scripts/publish-results.js', import.meta.url));
    const env = { ...process.env, ARTIFACT_DIR: artifact, SOURCE_RUN_ID: '123456', SOURCE_ISSUE_NUMBER: '42' };
    const first = spawnSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const before = (await readdir(path.join(root, 'dist'))).sort();
    assert.equal(before.length, 2);
    const second = spawnSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /"idempotent":true/);
    assert.deepEqual((await readdir(path.join(root, 'dist'))).sort(), before);
    assert.equal((await sharp(path.join(root, 'dist', file)).metadata()).format, 'png');
    assert.ok((await stat(path.join(root, 'dist', file))).size > 100);
  } finally { await rm(root, { recursive: true, force: true }); }
});
