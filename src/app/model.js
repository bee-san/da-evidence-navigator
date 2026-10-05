// Optional second opinion from a small language model that runs in the
// browser. Only used after the user agrees. The model and its runtime are
// downloaded from Hugging Face and jsDelivr; the letter itself never leaves
// the device, and nothing is cached.
//
// The model is a general-purpose natural language inference model. It has
// not been trained on legal aid letters, so it only gives a view on whether
// each key sentence reads as definite or uncertain.

export const MODEL = {
  id: 'Xenova/nli-deberta-v3-xsmall',
  library: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm',
  size: 'about 90 MB',
};

// Measured on 45 test letters (pack, fictional and edited variations),
// with a sentence only called uncertain at 90% confidence or more:
// 11 of 16 hedged letters flagged, 0 of 29 firm letters flagged. A smaller
// MobileBERT model flagged 19 of the 29 firm letters, so was not used.
export const MEASURED = { hedgedCaught: 11, hedged: 16, firmFlagged: 0, firm: 29 };
const THRESHOLD = 0.9;
const LABELS = ['sure', 'unsure'];
const TEMPLATE = 'The writer is {} about this.';

let classifier;
async function load(onProgress) {
  if (!classifier) {
    const { pipeline, env } = await import(MODEL.library);
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    classifier = pipeline('zero-shot-classification', MODEL.id, {
      dtype: 'q8',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.file?.endsWith('.onnx')) onProgress?.(`Downloading the model: ${Math.round(p.progress)}%`);
      },
    });
  }
  return classifier;
}

// Sentences that carry the professional's confirmation or judgement.
export function keySentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /\b(confirm|judgement|consistent|assessed|i am providing|i have provided|records show)\b/i.test(s))
    .filter((s) => !/asked to (confirm|provide)/i.test(s))
    .slice(0, 8);
}

// Set phrases like "I can confirm that" sound certain whatever follows, so
// the model reads the claim without them.
export function claim(sentence) {
  return sentence
    .replace(/\b(accordingly, )?i can confirm that\b/gi, '')
    .replace(/\bin my (reasonable )?professional judgement,?/gi, '')
    .replace(/^[\s,]+/, '')
    .replace(/^./, (c) => c.toUpperCase());
}

export async function secondOpinion(text, onProgress) {
  const classify = await load(onProgress);
  onProgress?.('Reading the letter');
  const out = [];
  for (const sentence of keySentences(text)) {
    const r = await classify(claim(sentence), LABELS, { hypothesis_template: TEMPLATE });
    const top = r.labels[0];
    const label = top === 'sure' ? 'definite' : r.scores[0] >= THRESHOLD ? 'uncertain' : 'unclear';
    out.push({ sentence, label, score: r.scores[0] });
  }
  return out;
}
