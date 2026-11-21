/**
 * Falmouth for Intentional Tech: signup proxy (Cloudflare Worker)
 *
 * Browser  ->  POST /api/supporters  (this Worker)  ->  Four Norms API  ->  back to browser
 *
 * The Four Norms API key lives only here, as an encrypted Worker secret
 * (FOUR_NORMS_API_KEY). It is never sent to the browser.
 *
 * Environment:
 *   FOUR_NORMS_API_KEY     secret   (wrangler secret put FOUR_NORMS_API_KEY)
 *   FOUR_NORMS_GROUP_SLUG  var      e.g. "falmouth-unplugged"
 *   ALLOWED_ORIGINS        var      comma-separated list of site origins allowed to call this
 *   FOUR_NORMS_API_BASE    var      optional, defaults to https://www.fournorms.com/api/v1
 */

const DEFAULT_API_BASE = 'https://www.fournorms.com/api/v1';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const MAX_LEN = 100;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, group: env.FOUR_NORMS_GROUP_SLUG || null, configured: Boolean(env.FOUR_NORMS_API_KEY) }, 200, cors);
    }

    if (url.pathname !== '/api/supporters') {
      return json({ error: 'Not found' }, 404, cors);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, { ...cors, Allow: 'POST, OPTIONS' });
    }
    if (!isAllowedOrigin(origin, env)) {
      return json({ error: 'Origin not allowed' }, 403, cors);
    }
    if (!env.FOUR_NORMS_API_KEY || !env.FOUR_NORMS_GROUP_SLUG) {
      return json({ error: 'Signup is not configured yet.' }, 500, cors);
    }

    // ---- parse + validate ----------------------------------------------------
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body', errors: ['Please refresh the page and try again.'] }, 400, cors);
    }

    // Honeypot: real people never fill the hidden "website" field. Pretend success for bots.
    if (body && typeof body.website === 'string' && body.website.trim() !== '') {
      return json({ status: 'success', message: 'Supporter Added' }, 201, cors);
    }

    const { payload, errors } = buildPayload(body || {});
    if (errors.length) {
      return json({ error: 'Validation failed', errors }, 422, cors);
    }

    // ---- forward to Four Norms ----------------------------------------------
    const base = (env.FOUR_NORMS_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
    const upstreamUrl = `${base}/groups/${encodeURIComponent(env.FOUR_NORMS_GROUP_SLUG)}/supporters.json`;

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-Key': env.FOUR_NORMS_API_KEY,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Four Norms network error', err);
      return json({ error: 'Could not reach Four Norms. Please try again in a minute.' }, 500, cors);
    }

    const text = await upstream.text();
    let upstreamJson = null;
    try { upstreamJson = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

    if (upstream.ok) {
      // Success: return Four Norms' JSON unchanged, e.g. {"status":"success","message":"Supporter Added"}.
      // POST responses are never cacheable, so no-store rather than a public max-age.
      return new Response(text || JSON.stringify({ status: 'success' }), {
        status: upstream.status,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (upstream.status === 422) {
      // Validation errors from Four Norms (e.g. email already used, bad zip): show them to the person.
      const errs = Array.isArray(upstreamJson?.errors) ? upstreamJson.errors : ['Some details could not be accepted.'];
      return json({ error: 'Validation failed', errors: errs }, 422, cors);
    }

    // 400 / 401 / 403 / 5xx: a configuration or upstream problem, not something the visitor can fix.
    console.error('Four Norms upstream error', upstream.status, text.slice(0, 500));
    return json({ error: 'Signup service error. Please try again later.', upstream_status: upstream.status }, 502, cors);
  },
};

// ---------------------------------------------------------------------------

export function buildPayload(body) {
  const clean = (v) => (typeof v === 'string' ? v.trim() : '');
  const first = clean(body.first_name);
  const last = clean(body.last_name);
  const email = clean(body.email).toLowerCase();
  const zip = clean(body.zip_code);
  const errors = [];

  if (!first) errors.push('First name is required.');
  if (!email) errors.push('Email is required.');
  else if (!EMAIL_RE.test(email)) errors.push('Please enter a valid email address.');
  if (zip && !ZIP_RE.test(zip)) errors.push('ZIP code should be 5 digits.');
  for (const [k, v] of Object.entries({ first, last, email, zip })) {
    if (v.length > MAX_LEN) errors.push(`${k.replace('_', ' ')} is too long.`);
  }

  // Four Norms: send_invite=true emails an invite to create a member account; false adds a lead.
  const sendInvite = body.send_invite === true || body.send_invite === 'true';

  const supporter = { email, first_name: first };
  if (last) supporter.last_name = last;
  if (zip) supporter.address_attributes = { zip_code: zip };

  return { payload: { send_invite: sendInvite, supporter }, errors };
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  const list = allowedOrigins(env);
  if (list.length === 0) return true; // not locked down (dev only)
  return list.includes(origin);
}

function corsHeaders(origin, env) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (isAllowedOrigin(origin, env) && origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(obj, status, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
