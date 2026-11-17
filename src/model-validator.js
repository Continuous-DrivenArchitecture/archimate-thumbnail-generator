const decodeXmlAttribute = (value) => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token) => {
  const predefined = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  if (token[0] !== '#') return predefined[token.toLowerCase()];
  const codepoint = token[1].toLowerCase() === 'x' ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
  if (!Number.isInteger(codepoint) || codepoint < 0 || codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) throw new Error('Model name contains an invalid XML character reference');
  return String.fromCodePoint(codepoint);
});

export function validateArchiMateModel(xml) {
  if (typeof xml !== 'string' || xml.length < 100 || xml.length > 100 * 1024 * 1024) throw new Error('Model XML has an invalid size');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD and entity declarations are not permitted');
  if (!/^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?<archimate:model(?:\s|>)/i.test(xml) || !/xmlns:archimate=["']http:\/\/www\.archimatetool\.com\/archimate["']/i.test(xml)) {
    throw new Error('File is not a native ArchiMate model');
  }
  if (!/<folder\b/i.test(xml) || !/<element\b/i.test(xml)) throw new Error('Model is missing required folders or elements');
  const views = [...xml.matchAll(/xsi:type=["']archimate:ArchimateDiagramModel["']/g)].length;
  const root = xml.match(/^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?<archimate:model\b([^>]*)>/i)?.[1];
  const encodedName = root?.match(/(?:^|\s)name\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
  const modelName = encodedName && decodeXmlAttribute(encodedName).trim();
  if (!modelName || modelName.length > 200) throw new Error('Model must have a non-empty name of at most 200 characters');
  return { modelName, viewCount: views };
}
