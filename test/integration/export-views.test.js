import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { chmod, cp, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { ArchiRuntime } from '@continuous-driven-architecture/archi-runtime';
import { extractViews } from '../../src/view-extractor.js';
import { createThumbnail } from '../../src/thumbnail-generator.js';
import { viewOutputFilename } from '../../src/output-naming.js';
import { createManifest } from '../../src/manifest-generator.js';
import { removeIsolatedTempDirectory } from '../../src/temp-cleanup.js';

test('Archi runtime exports all model views as real diagrams', { timeout: 300_000 }, async (t) => {
  if (process.env.RUN_ARCHI_INTEGRATION !== '1') return t.skip('Set RUN_ARCHI_INTEGRATION=1 to run the Docker integration test');
  const root = await mkdtemp(path.join(os.tmpdir(), 'archimate-export-'));
  const workspace = path.join(root, 'workspace');
  const output = path.join(root, 'output');
  const dist = path.join(root, 'dist');
  await Promise.all([mkdir(workspace), mkdir(output), mkdir(dist)]);
  try {
    await cp(new URL('../fixtures/three-views.archimate', import.meta.url), path.join(workspace, 'model.archimate'));
    if (process.platform === 'linux') await Promise.all([chmod(root, 0o755), chmod(workspace, 0o777), chmod(output, 0o777), chmod(path.join(workspace, 'model.archimate'), 0o644)]);
    const runtime = new ArchiRuntime({ image: 'ghcr.io/continuous-drivenarchitecture/archi-runtime:v0.1.0', workspace, outputDirectory: output, timeout: 240_000 });
    const result = await runtime.run({ args: ['--loadModel', '/workspace/model.archimate', '--html.createReport', '/output/report'] });
    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Report generated!/);
    const views = await extractViews(path.join(output, 'report'), { maxViews: 100 });
    assert.equal(views.length, 3);
    assert.deepEqual(views.map((view) => `${view.name}:${view.reportId}`).sort(), [
      'Application View:view-application', 'Business View:view-business', 'Technology View:view-technology'
    ]);
    const files = [];
    const manifestViews = [];
    const timestamp = new Date('2026-11-17T03:30:00Z');
    const modelPath = path.join(workspace, 'model.archimate');
    for (const view of views) {
      const filename = viewOutputFilename({ issueNumber: 1, timestamp, name: view.name, id: view.reportId });
      const target = path.join(dist, filename);
      await createThumbnail(view.imagePath, target);
      const image = await sharp(target).metadata();
      assert.equal(image.format, 'png');
      assert.ok(image.width > 1 && image.height > 1);
      const stats = await sharp(target).stats();
      assert.ok(stats.channels.slice(0, 3).some((channel) => channel.stdev > 0.5), `${view.name} should contain rendered diagram pixels`);
      files.push(filename);
      manifestViews.push({ name: view.name, id: view.reportId, file: filename });
    }
    assert.equal(new Set(files).size, views.length);
    assert.deepEqual((await readdir(dist)).sort(), files.sort());
    const manifest = await createManifest({ issueNumber: 1, runId: 'test-run', timestamp, modelName: 'Three-view fixture', modelPath, views: manifestViews, versions: { archi: '5.11.0', coArchi: '0.9.8' } });
    assert.equal(manifest.viewsDetected, 3);
    assert.equal(manifest.thumbnailsGenerated, 3);
    assert.equal(manifest.errorCount, 0);
    assert.equal(new Set(manifest.views.map((view) => view.id)).size, 3);
    await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest));
    const savedManifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
    assert.deepEqual(savedManifest.views.map((view) => view.name).sort(), views.map((view) => view.name).sort());
  } finally {
    await removeIsolatedTempDirectory(root);
  }
});
