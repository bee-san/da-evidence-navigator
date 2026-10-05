// Reads text from a letter file entirely in the browser.
// Text files are read directly, and Word (.docx) files are unzipped (docx.js).
// PDFs use their text layer, and scanned pages are rendered and passed to the
// text reader. Photos go straight to it.
// The text reader is PaddleOCR (paddleocr.js on ONNX Runtime Web) with the
// PP-OCRv6 models. All libraries and models are served from this site, and
// nothing is cached or sent anywhere.

import { OCR_MODEL } from './ocr-model.js';
import { docxText } from './docx.js';

export { OCR_MODEL };
const vendor = (p) => new URL(`../assets/vendor/${p}`, import.meta.url).href;

// Longest side photos are scaled to before reading: enough for a phone photo
// of an A4 page, and keeps reading quick on a phone.
const MAX_SIDE = 2000;

let readerPromise;
function reader(onProgress) {
  if (!readerPromise) {
    readerPromise = (async () => {
      onProgress?.('Getting the text reader ready');
      const [ort, { PaddleOcrService }] = await Promise.all([
        import(vendor('onnxruntime/ort.wasm.min.mjs')),
        import(vendor('paddleocr/paddleocr.mjs')),
      ]);
      ort.env.wasm.wasmPaths = vendor('onnxruntime/');
      // Several threads need cross-origin isolation, which this site does not use.
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const get = async (f) => {
        const res = await fetch(vendor(`paddleocr/${OCR_MODEL}/${f}`), { cache: 'no-store' });
        if (!res.ok) throw new Error(`text reader file ${f} returned ${res.status}`);
        return f.endsWith('.txt') ? res.text() : res.arrayBuffer();
      };
      const [det, rec, dict] = await Promise.all([get('det.onnx'), get('rec.onnx'), get('dict.txt')]);
      return PaddleOcrService.createInstance({
        ort,
        modelPreset: OCR_MODEL,
        detection: { modelBuffer: det },
        recognition: { modelBuffer: rec, charactersDictionary: dict.split('\n') },
      });
    })().catch((e) => { readerPromise = undefined; throw e; });
  }
  return readerPromise;
}

// Pixels from a photo file or a canvas, scaled down if very large.
async function pixels(image) {
  const source = image instanceof HTMLCanvasElement ? image : await createImageBitmap(image);
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(source.width * scale), height: Math.round(source.height * scale) });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data: new Uint8Array(data.buffer) };
}

async function ocr(image, onProgress) {
  const paddle = await reader(onProgress);
  onProgress?.('Reading the text');
  let found = 0;
  let done = 0;
  const results = await paddle.recognize(await pixels(image), {
    onProgress(e) {
      if (e.type === 'det' && e.stage === 'postprocess') found = e.detectedCount || 0;
      if (e.type === 'rec' && e.stage === 'item' && found) onProgress?.(`Reading the text: ${Math.round((100 * (done += 1)) / found)}%`);
    },
  });
  return paddle.processRecognition(results).text;
}

async function pdfText(file, onProgress) {
  const pdfjs = await import(vendor('pdfjs/pdf.min.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc = vendor('pdfjs/pdf.worker.min.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, wasmUrl: vendor('pdfjs/wasm/') });
  const doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    onProgress?.(`Reading page ${n} of ${doc.numPages}`);
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = content.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('').trim();
    // Read the page with the text reader if it has no text layer (a scan), or if it has a picture
    // and only a little real text, like a scan with a typed header added. Keep whichever is longer.
    if (text.length < 40 || (text.length < 400 && await hasPicture(page, pdfjs.OPS))) {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      const read = await ocr(canvas, (m) => onProgress?.(`Page ${n} of ${doc.numPages}: ${m}`));
      if (read.trim().length > text.length) text = read;
    }
    pages.push(text);
  }
  await task.destroy();
  return pages.join('\n\n');
}

async function hasPicture(page, OPS) {
  const { fnArray } = await page.getOperatorList();
  return fnArray.some((op) => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject || op === OPS.paintImageMaskXObject);
}

export const UNSUPPORTED = 'Choose a photo, PDF, Word (.docx) or text file';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function extractText(file, onProgress) {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return pdfText(file, onProgress);
  if (file.type === DOCX || name.endsWith('.docx')) return docxText(file);
  if (name.endsWith('.doc') || file.type === 'application/msword') throw new Error('Older Word (.doc) files cannot be read. Save it as .docx or PDF and try again.');
  if (file.type.startsWith('image/')) return ocr(file, onProgress);
  if (file.type.startsWith('text/') || /\.(txt|md)$/.test(name)) return file.text();
  throw new Error(UNSUPPORTED);
}

export async function stopOcr() {
  if (readerPromise) {
    const r = await readerPromise.catch(() => null);
    readerPromise = undefined;
    await r?.destroy?.();
  }
}
