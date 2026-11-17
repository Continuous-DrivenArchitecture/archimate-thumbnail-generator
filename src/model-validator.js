export function validateArchiMateModel(xml) {
  if (typeof xml !== 'string' || xml.length < 100 || xml.length > 100 * 1024 * 1024) throw new Error('Model XML has an invalid size');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD and entity declarations are not permitted');
  if (!/^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?<archimate:model(?:\s|>)/i.test(xml) || !/xmlns:archimate=["']http:\/\/www\.archimatetool\.com\/archimate["']/i.test(xml)) {
    throw new Error('File is not a native ArchiMate model');
  }
  if (!/<folder\b/i.test(xml) || !/<element\b/i.test(xml)) throw new Error('Model is missing required folders or elements');
  const views = [...xml.matchAll(/xsi:type=["']archimate:ArchimateDiagramModel["']/g)].length;
  return { viewCount: views };
}
