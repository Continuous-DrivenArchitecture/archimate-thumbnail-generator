import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { downloadAndExtractModel, extractModelZip } from '../../src/attachment-downloader.js';

async function makeZip(file, entries) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of entries) zip.addBuffer(Buffer.from(content), name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(file));
}

async function zipBuffer(entries) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of entries) zip.addBuffer(Buffer.from(content), name);
  zip.end();
  const chunks = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test('extracts exactly one valid model to a fixed safe path', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-zip-'));
  try {
    const zip = path.join(temp, 'source.zip');
    const target = path.join(temp, 'isolated');
    const xml = await readFile(new URL('../fixtures/three-views.archimate', import.meta.url), 'utf8');
    await makeZip(zip, [['user-controlled-name.archimate', xml]]);
    const result = await extractModelZip(zip, target);
    assert.equal(result.viewCount, 3);
    assert.equal(path.basename(result.modelPath), 'model.archimate');
    assert.match(await readFile(result.modelPath, 'utf8'), /Thumbnail Test Model/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('rejects additional files and archives over configured limits', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-zip-'));
  try {
    const xml = await readFile(new URL('../fixtures/three-views.archimate', import.meta.url), 'utf8');
    const extra = path.join(temp, 'extra.zip');
    await makeZip(extra, [['model.archimate', xml], ['script.js', 'not executed']]);
    await assert.rejects(extractModelZip(extra, path.join(temp, 'out')), /exactly one/);
    const limited = path.join(temp, 'limited.zip');
    await makeZip(limited, [['model.archimate', xml]]);
    await assert.rejects(extractModelZip(limited, path.join(temp, 'limited-out'), { maxUncompressedBytes: 500 }), /limits/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('streams a GitHub upload under the byte cap and blocks redirects to untrusted hosts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-download-'));
  const xml = await readFile(new URL('../fixtures/three-views.archimate', import.meta.url), 'utf8');
  const archive = await zipBuffer([['model.archimate', xml]]);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(archive, { status: 200 });
    const extracted = await downloadAndExtractModel('https://github.com/user-attachments/files/123/model.zip', path.join(temp, 'ok'), { maxZipBytes: archive.length + 1 });
    assert.equal(extracted.viewCount, 3);
    await assert.rejects(downloadAndExtractModel('https://github.com/user-attachments/files/123/model.zip', path.join(temp, 'small'), { maxZipBytes: 16 }), /download limit/);
    let fetchCount = 0;
    globalThis.fetch = async () => { fetchCount++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }); };
    await assert.rejects(downloadAndExtractModel('https://github.com/user-attachments/files/123/model.zip', path.join(temp, 'redirect')),
      /disallowed host/);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temp, { recursive: true, force: true });
  }
});
