import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { extractViews } from '../../src/view-extractor.js';

test('extracts only HTML pages explicitly identifying Archi diagram views', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'archimate-report-'));
  try {
    await mkdir(path.join(root, 'modelhash', 'views'), { recursive: true });
    await mkdir(path.join(root, 'modelhash', 'images'));
    await writeFile(path.join(root, 'modelhash', 'images', 'view.png'), 'png');
    await writeFile(path.join(root, 'modelhash', 'views', 'id-a.html'), '<html><head><title>Business View</title></head><img class="diagram" src="../images/view.png"></html>');
    await writeFile(path.join(root, 'modelhash', 'views', 'decorative.html'), '<html><img src="../images/view.png"></html>');
    await writeFile(path.join(root, 'modelhash', 'images', 'icon.png'), 'icon');
    const views = await extractViews(root);
    assert.equal(views.length, 1);
    assert.equal(views[0].name, 'Business View');
    assert.equal(views[0].reportId, 'id-a');
    await assert.rejects(extractViews(root, { maxViews: 0 }), /exceeds configured limit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
