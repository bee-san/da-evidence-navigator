// Builds a small .docx file for tests: a zip with document.xml (and optional header and footer),
// deflate-compressed like Word does, using Node's CompressionStream.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (data) => { let c = 0xffffffff; for (const b of data) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const deflate = async (data) => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const paras = (lines) => lines.map((l) => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${l.split('\t').map((part, i) => `${i ? '<w:r><w:tab/></w:r>' : ''}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(part)}</w:t></w:r>`).join('')}</w:p>`).join('');

export async function makeDocx({ paragraphs, header = [], footer = [] }) {
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': `<?xml version="1.0"?><w:document ${W}><w:body>${paras(paragraphs)}<w:sectPr/></w:body></w:document>`,
  };
  if (header.length) files['word/header1.xml'] = `<?xml version="1.0"?><w:hdr ${W}>${paras(header)}</w:hdr>`;
  if (footer.length) files['word/footer1.xml'] = `<?xml version="1.0"?><w:ftr ${W}>${paras(footer)}</w:ftr>`;
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const data = await deflate(raw);
    const nameBytes = enc.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(8, 8, true);
    local.setUint32(14, crc32(raw), true); local.setUint32(18, data.length, true); local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    locals.push(new Uint8Array(local.buffer), nameBytes, data);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(10, 8, true);
    central.setUint32(16, crc32(raw), true); central.setUint32(20, data.length, true); central.setUint32(24, raw.length, true);
    central.setUint16(28, nameBytes.length, true); central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return Buffer.concat([...locals, ...centrals, new Uint8Array(end.buffer)]);
}
