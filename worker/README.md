# Sign-up proxy (Cloudflare Worker)

The site's `/join/` form sends sign-ups here. This Worker adds the person to the
**Falmouth Unplugged** group on Four Norms using the Four Norms API.

```
browser (/join/ form) ──POST /api/supporters──▶ this Worker ──X-API-Key──▶ Four Norms API
                                                 (key lives here only)     POST /groups/falmouth-unplugged/supporters.json
```

**Why a Worker?** The site is static (Hugo on GitHub Pages), so it has no server to hide the
API key or avoid CORS. A Cloudflare Worker is a tiny free server that does just this one job
(the free tier is 100,000 requests a day), and the site stays on GitHub Pages.

## What it does

| Visitor sends | Worker returns |
|---|---|
| valid details | Four Norms' response unchanged (`201 {"status":"success","message":"Supporter Added"}`) |
| missing/invalid fields | `422 {"error","errors":[…]}` (checked before calling Four Norms) |
| Four Norms rejects them (e.g. email taken) | `422` with Four Norms' own `errors` messages |
| Four Norms 400/401/403/5xx | `502 {"error": …}` (config/upstream problem) |
| Four Norms unreachable | `500 {"error": …}` |
| hidden "website" field filled (bot) | fake `201`, nothing sent |
| request from a site not in `ALLOWED_ORIGINS` | `403` |

* **"Become a member"** sends `send_invite: true`, so Four Norms emails an invite to create an account.
* **"Just send me updates"** sends `send_invite: false`, which adds them as a lead.
* Responses use `Cache-Control: no-store`. These are POSTs carrying personal data, so they should never be cached.

## One-time setup (~10 minutes)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. In this `worker/` folder:
   ```bash
   npm install
   npx wrangler login
   ```
3. Edit `wrangler.toml` and set `ALLOWED_ORIGINS` to your site, e.g.
   `https://falmouthunplugged.org,https://USERNAME.github.io,http://localhost:1313`.
4. Store the API key as an encrypted secret. Paste it when prompted; it is never written to a file:
   ```bash
   npx wrangler secret put FOUR_NORMS_API_KEY
   ```
5. Deploy:
   ```bash
   npx wrangler deploy
   ```
   It prints a URL like `https://falmouth-unplugged-signup.<you>.workers.dev`.
6. In the site's `hugo.toml`, set
   `signupEndpoint = "https://falmouth-unplugged-signup.<you>.workers.dev/api/supporters"`
   and push. All Join buttons then go to the on-site `/join/` form.

## Testing

**Automated (no key needed, Four Norms mocked):**
```bash
npm test          # 14 tests: payload shape, validation, honeypot, 422 passthrough, 502/500, CORS, key never leaked
```

**Health check after deploying:**
```bash
curl https://falmouth-unplugged-signup.<you>.workers.dev/api/health
# {"ok":true,"group":"falmouth-unplugged","configured":true}   <- configured:false means the secret isn't set
```

**Local, against the real API:**
```bash
cp .dev.vars.example .dev.vars     # paste your key into .dev.vars (gitignored)
npx wrangler dev                   # Worker on http://localhost:8787
# in another terminal, from the site root:
hugo server                        # with signupEndpoint = "http://localhost:8787/api/supporters"
```
Open http://localhost:1313/join/ and try:
1. **Empty submit**: red fields and "Please fix the following".
2. **Your own email + "Just send me updates"**: success message. Check you appear as a lead in Four Norms.
3. **Same email again**: whatever Four Norms says about duplicates is shown in the form.
4. **A second address + "Become a member"**: you get the Four Norms invite email.

Remove test entries from Four Norms afterwards.

**Watching live logs:** `npx wrangler tail` shows errors (the API key is never logged).

## Notes
* If you get `502` with `upstream_status: 401/403`, the key is wrong or not scoped to the
  Turning Life On organization. Check with Four Norms.
* The API docs list no rate limits. If spam becomes a problem, add Cloudflare Turnstile
  (free CAPTCHA) or a rate-limit rule in the Cloudflare dashboard.
