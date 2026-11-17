import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import sharp from 'sharp';
import { createThumbnail, slugify } from '../../src/thumbnail-generator.js';

test('slugifies view names into safe filenames', () => {
  assert.equal(slugify('Arquitectura de Negocio / 2026'), 'arquitectura-de-negocio-2026');
  assert.equal(slugify('東京'), 'view');
});

test('creates a valid PNG without enlarging and preserves aspect ratio', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'archimate-thumb-'));
  try {
    const input = path.join(dir, 'input.png');
    const output = path.join(dir, 'output.png');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1200"><rect width="2400" height="1200" fill="white"/><rect x="100" y="100" width="500" height="200" fill="#ddf" stroke="#222"/><text x="120" y="200">A rendered diagram</text></svg>';
    await sharp(Buffer.from(svg)).png().toFile(input);
    const result = await createThumbnail(input, output, { maxDimension: 1200 });
    assert.deepEqual([result.width, result.height], [1200, 600]);
    assert.deepEqual([ (await sharp(output).metadata()).format, (await stat(output)).size > 100 ], ['png', true]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a blank image instead of presenting it as a thumbnail', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'archimate-blank-'));
  try {
    const input = path.join(dir, 'blank.png');
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } }).png().toFile(input);
    await assert.rejects(createThumbnail(input, path.join(dir, 'out.png')), /no visible diagram content/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
