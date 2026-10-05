// Reads text from a letter file entirely in the browser.
// Text files are read directly. PDFs use their text layer, and scanned
// pages are rendered and passed to Tesseract. Photos go straight to Tesseract.
// All libraries and language data are served from this site, and nothing is
// cached or sent anywhere.

const vendor = (p) => new URL(`../assets/vendor/${p}`, import.meta.url).href;

let workerPromise;
function ocrWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = import(vendor('tesseract/tesseract.esm.min.js')).then(({ default: Tesseract }) =>
      Tesseract.createWorker('eng', 1, {
        workerPath: vendor('tesseract/worker.min.js'),
        corePath: vendor('tesseract/core'),
        langPath: vendor('tesseract/lang'),
        cacheMethod: 'none',
        workerBlobURL: false,
        logger: (m) => progress.fn?.(m),
      }));
  }
  progress.fn = onProgress;
  return workerPromise;
}
const progress = { fn: null };

async function ocr(image, onProgress) {
  const worker = await ocrWorker((m) => {
    if (m.status === 'recognizing text') onProgress?.(`Reading the text: ${Math.round(m.progress * 100)}%`);
    else if (m.status) onProgress?.('Getting the text reader ready');
  });
  const { data } = await worker.recognize(image);
  return data.text;
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
    if (text.length < 40) {
      // No text layer: this page is a scan.
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      text = await ocr(canvas, (m) => onProgress?.(`Page ${n} of ${doc.numPages}: ${m}`));
    }
    pages.push(text);
  }
  await task.destroy();
  return pages.join('\n\n');
}

export async function extractText(file, onProgress) {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return pdfText(file, onProgress);
  if (file.type.startsWith('image/')) return ocr(file, onProgress);
  if (file.type.startsWith('text/') || /\.(txt|md)$/.test(name)) return file.text();
  throw new Error('Choose a photo, PDF or text file');
}

export async function stopOcr() {
  if (workerPromise) {
    const w = await workerPromise;
    workerPromise = undefined;
    await w.terminate();
  }
}
