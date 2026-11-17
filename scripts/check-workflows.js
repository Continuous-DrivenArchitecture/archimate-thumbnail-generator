import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (entry.isFile() && entry.name.endsWith('.yml')) {
      const document = YAML.parseDocument(await readFile(filename, 'utf8'), { uniqueKeys: true });
      if (document.errors.length) throw new Error(`${filename}: ${document.errors.map((error) => error.message).join('; ')}`);
      const data = document.toJS();
      if (!data || typeof data !== 'object') throw new Error(`${filename}: expected a YAML mapping`);
      for (const job of Object.values(data.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (typeof step.with?.script === 'string') {
            try { new AsyncFunction(step.with.script); }
            catch (error) { throw new Error(`${filename}: invalid inline JavaScript: ${error.message}`); }
          }
        }
      }
    }
  }
}

await visit('.github');
