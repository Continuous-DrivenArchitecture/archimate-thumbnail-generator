import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUtcTimestamp, viewOutputFilename } from '../../src/output-naming.js';

test('formats the execution time in UTC at second precision', () => {
  assert.equal(formatUtcTimestamp('2026-11-17T03:30:00.999Z'), '20261117-033000');
});

test('normalizes names and avoids collisions when different IDs slugify identically', () => {
  const used = new Set();
  const first = viewOutputFilename({ issueNumber: 42, timestamp: '2026-11-17T03:30:00Z', name: 'Business View', id: 'view_a' }, used);
  const second = viewOutputFilename({ issueNumber: 42, timestamp: '2026-11-17T03:30:00Z', name: 'Business View', id: 'view-a' }, used);
  assert.match(first, /^20261117-033000-issue42-business-view-view-a\.png$/);
  assert.notEqual(first, second);
  assert.match(second, /^20261117-033000-issue42-business-view-view-a-[a-f0-9]{8}\.png$/);
});
