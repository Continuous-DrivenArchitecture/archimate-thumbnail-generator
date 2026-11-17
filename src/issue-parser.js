const TITLE = /^### Model name\s*\n+([^\n]+?)(?:\n|$)/im;
const ATTACHMENT = /https:\/\/(?:github\.com\/user-attachments\/(?:files|assets)\/[^\s)<>]+|user-images\.githubusercontent\.com\/[^\s)<>]+)/gi;

export function parseIssue(body = '') {
  const modelName = body.match(TITLE)?.[1]?.trim();
  if (!modelName) throw new Error('The required “Model name” field is missing');
  const urls = [...new Set(body.match(ATTACHMENT) ?? [])].map((url) => url.replace(/[.,;]+$/, ''));
  if (urls.length !== 1) throw new Error(urls.length ? 'Attach exactly one native .archimate model file' : 'No .archimate attachment found');
  return { modelName: modelName.slice(0, 200), attachmentUrl: urls[0] };
}

export function validateAttachmentUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid attachment URL'); }
  const allowed = url.protocol === 'https:' && (
    (url.hostname === 'github.com' && /^\/user-attachments\/(files|assets)\/[A-Za-z0-9_-]+(?:\/[^/]*)?$/.test(url.pathname)) ||
    (url.hostname === 'user-images.githubusercontent.com' && /^\/[A-Za-z0-9_./-]+$/.test(url.pathname))
  );
  if (!allowed || url.username || url.password || url.port) throw new Error('Attachment URL is not an allowed GitHub upload URL');
  return url;
}
