import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateArchiMateModel } from '../../src/model-validator.js';

test('accepts a native Archi model and counts diagram models', async () => {
  const xml = await readFile(new URL('../fixtures/three-views.archimate', import.meta.url), 'utf8');
  const result = validateArchiMateModel(xml);
  assert.equal(result.modelName, 'Thumbnail Test Model');
  assert.equal(result.viewCount, 3);
});

test('decodes XML entities in the model name and requires a usable root name', () => {
  const xml = `<?xml version="1.0"?><archimate:model xmlns:archimate="http://www.archimatetool.com/archimate" name="R&amp;D &#x1F4D0; Model">${' '.repeat(100)}<folder/><element/></archimate:model>`;
  assert.equal(validateArchiMateModel(xml).modelName, 'R&D 📐 Model');
  const unnamed = `<?xml version="1.0"?><archimate:model xmlns:archimate="http://www.archimatetool.com/archimate">${' '.repeat(100)}<folder/><element/></archimate:model>`;
  assert.throws(() => validateArchiMateModel(unnamed), /non-empty name/);
});

test('rejects entity declarations and malformed model structure', () => {
  assert.throws(() => validateArchiMateModel(`<!DOCTYPE x [<!ENTITY x "y">]><archimate:model>${' '.repeat(100)}<folder/><element/></archimate:model>`), /DTD/);
  assert.throws(() => validateArchiMateModel(`<root>${' '.repeat(100)}</root>`), /native ArchiMate/);
});
