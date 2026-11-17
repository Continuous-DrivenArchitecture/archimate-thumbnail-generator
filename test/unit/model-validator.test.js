import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateArchiMateModel } from '../../src/model-validator.js';

test('accepts a native Archi model and counts diagram models', async () => {
  const xml = await readFile(new URL('../fixtures/three-views.archimate', import.meta.url), 'utf8');
  const result = validateArchiMateModel(xml);
  assert.equal(result.viewCount, 3);
});

test('rejects entity declarations and malformed model structure', () => {
  assert.throws(() => validateArchiMateModel(`<!DOCTYPE x [<!ENTITY x "y">]><archimate:model>${' '.repeat(100)}<folder/><element/></archimate:model>`), /DTD/);
  assert.throws(() => validateArchiMateModel(`<root>${' '.repeat(100)}</root>`), /native ArchiMate/);
});
