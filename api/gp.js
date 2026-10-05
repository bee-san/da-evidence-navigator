// Vercel function: contact details for a GP practice in England, from its
// public page on the NHS website (which does not allow calls from other
// websites' pages). Only the practice code is sent here – never anything
// about the person. Nothing is logged or stored.
//
// GET /api/gp?code=K84010 -> { name, telephone, email, url }

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' },
});

// Pulls the practice details out of the page's schema.org data.
export function practiceDetails(html) {
  const field = (name) => {
    const m = html.match(new RegExp(`"@type":"Physician"[\\s\\S]*?"${name}":"([^"]*)"`));
    return m ? m[1].replace(/\\u0026/g, '&').trim() : '';
  };
  const email = field('email');
  return {
    name: field('name'),
    telephone: field('telephone'),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    url: /^https?:\/\//.test(field('url')) ? field('url') : '',
  };
}

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code') || '';
  if (!/^[A-Z]\d{5}$/.test(code)) return json({ error: 'bad code' }, 400);
  const res = await fetch(`https://www.nhs.uk/services/gp-surgery/practice/${code}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; legal aid evidence prototype)' },
    redirect: 'follow',
  });
  if (res.status === 404) return json({ error: 'not found' }, 404);
  if (!res.ok) return json({ error: 'upstream' }, 502);
  const details = practiceDetails(await res.text());
  return details.name ? json(details) : json({ error: 'not found' }, 404);
}
