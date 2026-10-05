// Downloads the PaddleOCR text reading models used in the browser by
// src/app/ocr.js, from PaddlePaddle's official Hugging Face repositories
// (Apache-2.0), pinned to a revision and checked against SHA-256 hashes.
// Run by build.mjs; files are kept in .cache/ocr-models and not committed.
//
// Writes, for each model set: det.onnx, rec.onnx and dict.txt (the character
// list from the recognition model's inference.yml, plus the space character
// PaddleOCR adds).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const CACHE = '.cache/ocr-models';
const HF = 'https://huggingface.co/PaddlePaddle';
export const MODELS = {
  'PP-OCRv6_small': {
    det: { repo: 'PP-OCRv6_small_det_onnx', rev: '28fe5895c24fd108c19eb3e8479f4ab385fbfc62', sha256: 'd73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e' },
    rec: { repo: 'PP-OCRv6_small_rec_onnx', rev: 'b8f84f0b80c529de40b4fbb3544b84fa7233a513', sha256: '5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634', yml: 'ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1' },
  },
  'PP-OCRv6_tiny': {
    det: { repo: 'PP-OCRv6_tiny_det_onnx', rev: '2ba1506c0380b8f0b03dd142459aac66d4421f6c', sha256: '193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8' },
    rec: { repo: 'PP-OCRv6_tiny_rec_onnx', rev: '2612ab37152ae0a677521bae4e1e3d4fb4cf7c30', sha256: '9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6', yml: '66170210bad538e83fff3c4a3867e547d6bf20b50d64b20347c4b913f3034ea1' },
  },
};

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function download(repo, rev, file, expected) {
  const res = await fetch(`${HF}/${repo}/resolve/${rev}/${file}`);
  if (!res.ok) throw new Error(`${repo}/${file}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== expected) throw new Error(`${repo}/${file}: checksum does not match`);
  return buf;
}

// The YAML lists one character per line under PostProcess.character_dict.
export function dictionaryFromYaml(yml) {
  const lines = yml.slice(yml.indexOf('character_dict:')).split('\n').slice(1);
  const chars = [];
  for (const line of lines) {
    const m = line.match(/^\s*-\s(.*)$/);
    if (!m) break;
    let c = m[1];
    if (c.length >= 2 && c[0] === "'" && c.at(-1) === "'") c = c.slice(1, -1).replace(/''/g, "'");
    else if (c.length >= 2 && c[0] === '"' && c.at(-1) === '"') c = JSON.parse(c);
    chars.push(c);
  }
  return [...chars, ' '];
}

export async function fetchOcrModels(names = Object.keys(MODELS)) {
  for (const name of names) {
    const dir = `${CACHE}/${name}`;
    const m = MODELS[name];
    const ok = (f, h) => existsSync(`${dir}/${f}`) && sha(readFileSync(`${dir}/${f}`)) === h;
    if (ok('det.onnx', m.det.sha256) && ok('rec.onnx', m.rec.sha256) && existsSync(`${dir}/dict.txt`)) continue;
    mkdirSync(dir, { recursive: true });
    console.log(`Downloading ${name} text reading models`);
    writeFileSync(`${dir}/det.onnx`, await download(m.det.repo, m.det.rev, 'inference.onnx', m.det.sha256));
    writeFileSync(`${dir}/rec.onnx`, await download(m.rec.repo, m.rec.rev, 'inference.onnx', m.rec.sha256));
    const yml = (await download(m.rec.repo, m.rec.rev, 'inference.yml', m.rec.yml)).toString('utf8');
    writeFileSync(`${dir}/dict.txt`, dictionaryFromYaml(yml).join('\n'));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await fetchOcrModels();
