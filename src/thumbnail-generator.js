import path from 'node:path';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';

export function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'view';
}

export async function createThumbnail(inputPath, outputPath, { maxDimension = 1200 } = {}) {
  if (!Number.isInteger(maxDimension) || maxDimension < 64 || maxDimension > 4096) throw new Error('Thumbnail dimension is outside the allowed range');
  if ((await stat(inputPath)).size > 25 * 1024 * 1024) throw new Error('Diagram image exceeds the configured image size limit');
  const source = sharp(inputPath, { failOn: 'error', limitInputPixels: 100_000_000 });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 2 || metadata.height < 2) {
    throw new Error('Diagram image has invalid or empty dimensions');
  }
  const stats = await source.stats();
  if (!stats.channels.slice(0, 3).some((channel) => channel.stdev > 0.5)) throw new Error('Diagram image contains no visible diagram content');
  const { data, info } = await sharp(inputPath, { failOn: 'error', limitInputPixels: 100_000_000 })
    .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
    .png().toBuffer({ resolveWithObject: true });
  if (info.width < 2 || info.height < 2 || data.length < 100) throw new Error('Generated thumbnail is empty');
  await sharp(data).png().toFile(path.resolve(outputPath));
  return { width: info.width, height: info.height, bytes: data.length };
}
