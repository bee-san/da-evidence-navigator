// Text readers (OCR) to compare on ocr-compare.html. Every engine runs in the
// browser, so the photo never leaves the device. Tesseract is served from this
// site; the others download their code and models from jsDelivr or Hugging Face
// the first time they run.
//
// Each engine: { id, name, source, download, local, available(), read(img) }
// where img is { canvas, file } and read returns the text.

import { extractText, stopOcr } from './ocr.js';

const ORT_VERSION = '1.30.0';
const JSDELIVR = 'https://cdn.jsdelivr.net/npm';

let ortPromise;
async function onnxRuntime() {
  ortPromise ??= import(`${JSDELIVR}/onnxruntime-web@${ORT_VERSION}/dist/ort.min.mjs`).then((ort) => {
    ort.env.wasm.wasmPaths = `${JSDELIVR}/onnxruntime-web@${ORT_VERSION}/dist/`;
    ort.env.wasm.numThreads = 1; // the site is not cross-origin isolated
    return ort;
  });
  return ortPromise;
}

const buffer = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not download ${new URL(url).pathname.split('/').pop()} (${r.status})`);
  return r.arrayBuffer();
};
const textFile = async (url) => new TextDecoder().decode(await buffer(url));

function pixels(canvas) {
  const { width, height } = canvas;
  return { width, height, data: new Uint8Array(canvas.getContext('2d').getImageData(0, 0, width, height).data.buffer) };
}

// Each engine is created when first used. release() frees it again, so the
// page does not hold several engines and their models in memory at once.
function once(make, destroy = () => {}) {
  let p;
  const get = () => (p ??= make().catch((e) => { p = undefined; throw e; }));
  get.release = async () => {
    if (!p) return;
    const instance = await p.catch(() => null);
    p = undefined;
    if (instance) await destroy(instance);
  };
  return get;
}

// PaddleOCR dictionaries need the CTC blank first and a space last.
function dictionary(text) {
  const chars = text.split(/\r?\n/);
  while (chars.at(-1) === '') chars.pop();
  if (chars[0] !== '') chars.unshift('');
  if (chars.at(-1) !== ' ') chars.push(' ');
  return chars;
}

const paddleocrJs = once(async () => {
  const [{ PaddleOcrService }, ort] = await Promise.all([import(`${JSDELIVR}/paddleocr@1.2.0/+esm`), onnxRuntime()]);
  const base = 'https://huggingface.co/x3zvawq/paddleocr-js-onnx/resolve/main/ppocr_v5_mobile/';
  const [det, rec, dict] = await Promise.all([
    buffer(`${base}PP-OCRv5_mobile_det_infer.onnx`),
    buffer(`${base}PP-OCRv5_mobile_rec_infer.onnx`),
    textFile(`${base}ppocrv5_dict.txt`),
  ]);
  return PaddleOcrService.createInstance({
    ort,
    modelPreset: 'PP-OCRv5_mobile',
    detection: { modelBuffer: det },
    recognition: { modelBuffer: rec, charactersDictionary: dictionary(dict) },
  });
}, (service) => service.destroy());

const ppu = once(async () => {
  const { PaddleOcrService } = await import(`${JSDELIVR}/ppu-paddle-ocr@6.6.0/web/+esm`);
  const service = new PaddleOcrService();
  await service.initialize();
  return service;
}, (service) => service.destroy());

// Guten OCR comes from esm.sh, which keeps its internal modules shared (the
// jsDelivr build splits them, which breaks it), pinned to the ONNX Runtime it
// was built for.
const guten = once(async () => {
  const ESM = 'https://esm.sh';
  const [{ default: Ocr }, ort] = await Promise.all([
    import(`${ESM}/@gutenye/ocr-browser@1.4.9?deps=onnxruntime-web@1.17.3`),
    import(`${ESM}/onnxruntime-web@1.17.3?target=es2022`),
  ]);
  ort.env.wasm.wasmPaths = `${JSDELIVR}/onnxruntime-web@1.17.3/dist/`;
  ort.env.wasm.numThreads = 1;
  const models = `${JSDELIVR}/@gutenye/ocr-models@1.4.2/assets/`;
  return Ocr.create({
    models: {
      detectionPath: `${models}ch_PP-OCRv4_det_infer.onnx`,
      recognitionPath: `${models}ch_PP-OCRv4_rec_infer.onnx`,
      dictionaryPath: `${models}ppocr_keys_v1.txt`,
    },
  });
});

// An older UMD bundle: load it as a classic script.
const paddleJs = once(async () => {
  if (!window.paddlejs?.ocr) {
    await new Promise((resolve, reject) => {
      const s = Object.assign(document.createElement('script'), { src: `${JSDELIVR}/@paddlejs-models/ocr@1.2.4/lib/index.js`, crossOrigin: 'anonymous' });
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not download Paddle.js'));
      document.head.append(s);
    });
  }
  const { ocr } = window.paddlejs;
  await ocr.init();
  return ocr;
});

export const ENGINES = [
  {
    id: 'tesseract',
    name: 'Tesseract.js (current)',
    source: 'Tesseract 5, English model. Served from this site.',
    download: 'None – already on this site',
    local: true,
    available: () => true,
    read: ({ file }) => extractText(file),
    release: () => stopOcr(),
  },
  {
    id: 'paddleocr',
    name: 'paddleocr.js',
    source: 'x3zvawq/paddleocr.js 1.2.0 with PP-OCRv5 mobile models and ONNX Runtime Web.',
    download: 'About 30 MB from jsDelivr and Hugging Face',
    available: () => true,
    async read({ canvas }) {
      const service = await paddleocrJs();
      return service.processRecognition(await service.recognize(pixels(canvas))).text;
    },
    release: () => paddleocrJs.release(),
  },
  {
    id: 'ppu',
    name: 'ppu-paddle-ocr',
    source: 'ppu-paddle-ocr 6.6.0 (PaddleOCR in TypeScript) with its default models.',
    download: 'About 20 MB from jsDelivr and Hugging Face',
    available: () => true,
    async read({ canvas }) {
      const service = await ppu();
      return (await service.recognize(canvas, { flatten: true })).text;
    },
    release: () => ppu.release(),
  },
  {
    id: 'guten',
    name: 'Guten OCR',
    source: '@gutenye/ocr-browser 1.4.9 with PP-OCRv4 models. Currently fails: the CDN builds of its OpenCV dependency are broken, so it needs bundling into this site to work.',
    download: 'About 16 MB from jsDelivr',
    off: true,
    available: () => true,
    async read({ canvas }) {
      const ocr = await guten();
      const { texts } = await ocr.detect(canvas.toDataURL('image/png'));
      return texts.map((t) => t.text).join('\n');
    },
  },
  {
    id: 'paddlejs',
    name: 'Paddle.js OCR (Baidu)',
    source: '@paddlejs-models/ocr 1.2.4 – Baidu’s older WebGL version, last updated 2023.',
    download: 'About 10 MB from jsDelivr and Baidu’s servers',
    off: true, // slow and heavy, and its Chinese model drops English spaces
    available: () => true,
    async read({ canvas }) {
      const ocr = await paddleJs();
      const img = new Image();
      img.src = canvas.toDataURL('image/png');
      await img.decode();
      const res = await ocr.recognize(img);
      return (Array.isArray(res.text) ? res.text : [res.text]).join('\n');
    },
  },
  {
    id: 'textdetector',
    name: 'Built-in browser text detector',
    source: 'The Shape Detection API. Only in Chrome with experimental features turned on.',
    download: 'None',
    local: true,
    available: () => typeof window !== 'undefined' && 'TextDetector' in window,
    async read({ canvas }) {
      const found = await new window.TextDetector().detect(canvas);
      return found.sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x).map((t) => t.rawValue).join('\n');
    },
  },
];

// Share of words read correctly, compared with the known text (1 = perfect).
export function wordAccuracy(expected, actual) {
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  const a = words(expected);
  const b = words(actual);
  if (!a.length) return null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.max(0, 1 - prev[b.length] / a.length);
}
