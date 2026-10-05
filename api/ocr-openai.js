// Vercel function for the text reader comparison page: reads a letter photo
// with an OpenAI model (GPT-6 Sol by default). Unlike the other readers, this
// sends the photo to OpenAI, so the page only uses it after a separate consent.
// Nothing is logged or stored here.
//
// GET  /api/ocr-openai -> { enabled }
// POST /api/ocr-openai  { image: "data:image/jpeg;base64,..." } -> { text, model }

const MODEL = () => process.env.OCR_OPENAI_MODEL || 'gpt-6-sol';
const MAX_IMAGE_CHARS = 8_000_000; // about 6 MB of image

const PROMPT = 'Transcribe all the text in this photo of a letter exactly as written. Keep the line breaks. Do not correct, summarise or add anything. Reply with the text only.';

// Best effort per server instance.
const WINDOW_MS = 60 * 60 * 1000;
const PER_WINDOW = 30;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > PER_WINDOW;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export function GET() {
  return json({ enabled: !!process.env.OPENAI_API_KEY, model: MODEL() });
}

export async function POST(request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'Not set up: OPENAI_API_KEY is missing on the server' }, 503);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (limited(ip)) return json({ error: 'Too many photos in the last hour. Try again later.' }, 429);

  let image;
  try { ({ image } = await request.json()); } catch { return json({ error: 'bad request' }, 400); }
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE_CHARS) {
    return json({ error: 'Send one JPEG, PNG or WebP image under 6 MB' }, 400);
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(),
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: image } }] }],
    }),
  });
  if (!res.ok) return json({ error: `OpenAI returned ${res.status}` }, 502);
  const text = (await res.json()).choices?.[0]?.message?.content?.trim();
  return text ? json({ text, model: MODEL() }) : json({ error: 'OpenAI returned no text' }, 502);
}
