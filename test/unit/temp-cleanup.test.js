import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { removeIsolatedTempDirectory } from '../../src/temp-cleanup.js';

test('removes only uniquely named Archi temp directories under the OS temp root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'archimate-job-'));
  await mkdir(path.join(root, 'nested'));
  await removeIsolatedTempDirectory(root);
  await assert.rejects(removeIsolatedTempDirectory(path.join(os.tmpdir(), 'important-data')), /Refusing to clean/);
  await rm(root, { recursive: true, force: true });
});
