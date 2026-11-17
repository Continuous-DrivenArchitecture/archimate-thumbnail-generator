import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

for (const root of ['src', 'scripts', 'test']) {
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && file.endsWith('.js')) {
        const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
        if (result.status !== 0) process.exit(result.status ?? 1);
      }
    }
  }
  await visit(root);
}
