import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { downloadModel } from '../../src/attachment-downloader.js';

test('streams an .archimate.txt upload to a fixed model path and validates its XML contents', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-download-'));
  const xml = await readFile(new URL('../fixtures/three-views.archimate', import.meta.url), 'utf8');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
    const model = await downloadModel('https://github.com/user-attachments/files/123/three-views.archimate.txt', path.join(temp, 'model'));
    assert.equal(model.viewCount, 3);
    assert.equal(path.basename(model.modelPath), 'model.archimate');
    assert.match(await readFile(model.modelPath, 'utf8'), /Thumbnail Test Model/);
    await assert.rejects(downloadModel('https://github.com/user-attachments/files/123/three-views.archimate.txt', path.join(temp, 'small'), { maxModelBytes: 16 }), /size limit/);
    globalThis.fetch = async () => new Response(`<html>not an Archi model</html>${' '.repeat(100)}`, { status: 200 });
    await assert.rejects(downloadModel('https://github.com/user-attachments/files/123/not-a-model', path.join(temp, 'invalid')), /native ArchiMate/);
    let fetchCount = 0;
    globalThis.fetch = async () => { fetchCount++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }); };
    await assert.rejects(downloadModel('https://github.com/user-attachments/files/123/three-views.archimate.txt', path.join(temp, 'redirect')), /disallowed host/);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temp, { recursive: true, force: true });
  }
});
