import path from 'node:path';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { load } from 'cheerio';

const safeReportPath = (root, page, relative) => {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes('\0') || relative.startsWith('/') || /^[a-z]+:/i.test(relative)) return null;
  const resolved = path.resolve(path.dirname(page), ...relative.split('/'));
  return resolved.startsWith(`${path.resolve(root)}${path.sep}`) ? resolved : null;
};

/** Extract only report view pages that explicitly contain Archi's diagram image. */
export async function extractViews(reportDirectory, { maxViews = 500 } = {}) {
  const root = path.resolve(reportDirectory);
  const found = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'views') {
          for (const page of await readdir(filename, { withFileTypes: true })) {
            if (!page.isFile() || !page.name.endsWith('.html')) continue;
            const pagePath = path.join(filename, page.name);
            const html = await readFile(pagePath, 'utf8');
            const $ = load(html);
            const diagram = $('img.diagram').first();
            const imageRelative = diagram.attr('src');
            if (!imageRelative) continue;
            const imagePath = safeReportPath(root, pagePath, imageRelative);
            if (!imagePath) throw new Error(`Unsafe diagram image reference in ${page.name}`);
            const imageStat = await lstat(imagePath);
            if (!imageStat.isFile() || imageStat.isSymbolicLink()) throw new Error(`Diagram output is not a regular image file in ${page.name}`);
            const name = $('title').first().text().trim() || diagram.attr('alt')?.trim();
            if (!name) throw new Error(`Missing view name in ${page.name}`);
            const viewId = path.basename(page.name, '.html');
            found.push({ name, reportId: viewId, imagePath });
            if (found.length > maxViews) throw new Error(`View count exceeds configured limit (${maxViews})`);
          }
        } else {
          await walk(filename);
        }
      }
    }
  }
  await walk(root);
  if (!found.length) throw new Error('The Archi HTML report contains no diagram views');
  return found;
}
