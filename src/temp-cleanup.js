import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Remove only a directory created by mkdtemp under the OS temp root. */
export async function removeIsolatedTempDirectory(directory) {
  const resolved = path.resolve(directory);
  const root = path.resolve(os.tmpdir());
  const leaf = path.basename(resolved);
  if (path.dirname(resolved) !== root || !/^archimate-(?:job|export)-[A-Za-z0-9_-]+$/.test(leaf)) {
    throw new Error('Refusing to clean a path outside the isolated Archi temp directory');
  }
  try {
    await rm(resolved, { recursive: true, force: true });
  } catch (error) {
    if (process.platform !== 'linux' || !['EACCES', 'EPERM'].includes(error.code)) throw error;
    // Archi writes report files as image UID 10001. Use sudo only for this
    // exact mkdtemp path when its directories cannot be removed by the runner.
    const result = spawnSync('sudo', ['-n', 'rm', '-rf', '--', resolved], { encoding: 'utf8', timeout: 15_000 });
    if (result.error || result.status !== 0) throw new Error('Could not remove the isolated Archi temporary directory');
  }
}
