import { createHash } from 'node:crypto';
import { slugify } from './thumbnail-generator.js';

export function formatUtcTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Execution timestamp is invalid');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-').replace(/Z$/, '');
}

export function viewOutputFilename({ issueNumber, timestamp, name, id }, used = new Set()) {
  if (!Number.isSafeInteger(Number(issueNumber)) || Number(issueNumber) < 1) throw new Error('Issue number is invalid');
  const stamp = formatUtcTimestamp(timestamp);
  const base = `${stamp}-issue${Number(issueNumber)}-${slugify(name)}-${slugify(id)}`;
  let candidate = base;
  if (used.has(candidate)) candidate = `${base}-${createHash('sha256').update(String(id)).digest('hex').slice(0, 8)}`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return `${candidate}.png`;
}
