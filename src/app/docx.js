// Reads the text of a Word document (.docx) in the browser, with no library: a .docx file is a zip
// of XML files, unzipped here with the browser's own DecompressionStream. Nothing leaves the device.
//
// The letter body comes from word/document.xml. Headers come first and footers last, because the
// letterhead (the organisation's name and address) is often in the header.

const EOCD = 0x06054b50; // end of central directory
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

// Lists the files in a zip: { name: { method, offset, size } }.
function entries(view) {
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 22 - 0xffff); i -= 1) {
    if (view.getUint32(i, true) === EOCD) { end = i; break; }
  }
  if (end < 0) throw new Error('not a zip');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = {};
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error('bad zip');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + at + 46, nameLength));
    files[name] = { method, offset, size };
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

async function read(view, file) {
  const at = file.offset;
  if (view.getUint32(at, true) !== LOCAL) throw new Error('bad zip');
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const data = new Uint8Array(view.buffer, view.byteOffset + start, file.size);
  if (file.method === 0) return new TextDecoder().decode(data);
  if (file.method !== 8) throw new Error('unsupported compression');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&');

// The text of one WordprocessingML part: a line per paragraph, with tabs and line breaks kept.
export function wordXmlText(xml) {
  const paragraphs = xml.split(/<w:p[\s>]/).slice(1);
  return paragraphs.map((p) => {
    let line = '';
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>|<\/w:p>/g)) {
      if (m[1] !== undefined) line += decodeXml(m[1]);
      else if (m[0] === '<w:tab/>') line += '\t';
      else if (m[0].startsWith('<w:br') || m[0].startsWith('<w:cr')) line += '\n';
      else break;
    }
    return line;
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function docxText(file) {
  const view = new DataView(await file.arrayBuffer());
  let files;
  try {
    files = entries(view);
  } catch {
    throw new Error('This does not look like a Word (.docx) file. Save it as .docx or PDF and try again.');
  }
  if (!files['word/document.xml']) throw new Error('This does not look like a Word (.docx) file. Save it as .docx or PDF and try again.');
  const part = async (name) => wordXmlText(await read(view, files[name]));
  const sorted = (re) => Object.keys(files).filter((n) => re.test(n)).sort();
  const headers = await Promise.all(sorted(/^word\/header\d*\.xml$/).map(part));
  const body = await part('word/document.xml');
  const footers = await Promise.all(sorted(/^word\/footer\d*\.xml$/).map(part));
  // The same header is often repeated for first and later pages: keep each once.
  const unique = (list) => [...new Set(list.filter(Boolean))];
  return [...unique(headers), body, ...unique(footers)].join('\n\n').trim();
}
