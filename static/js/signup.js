// Falmouth for Intentional Tech sign-up form → Cloudflare Worker proxy → Four Norms API
(function () {
  const form = document.getElementById('fn-signup');
  if (!form) return;
  const msg = form.querySelector('.signup-msg');
  const btn = form.querySelector('button[type=submit]');
  const success = document.getElementById('fn-signup-success');
  const endpoint = form.dataset.endpoint;
  const fallback = form.dataset.fallback;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ?updates=1 preselects "Just send me updates"
  if (new URLSearchParams(location.search).get('updates')) {
    const r = form.querySelector('input[name=send_invite][value=false]');
    if (r) r.checked = true;
  }

  // No proxy configured yet: point people at the Four Norms form instead.
  if (!endpoint) {
    show('info', `Online sign-up is coming soon. For now, please <a href="${fallback}" target="_blank" rel="noopener">join us on Four Norms</a>.`);
  }

  function show(kind, html) {
    msg.hidden = false;
    msg.className = 'signup-msg ' + kind;
    msg.innerHTML = html;
  }
  function clearFieldErrors() {
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }
  function markInvalid(name) {
    const el = form.elements[name];
    if (el) el.setAttribute('aria-invalid', 'true');
  }
  function setLoading(on) {
    btn.disabled = on;
    form.classList.toggle('loading', on);
    btn.querySelector('.btn-label').textContent = on ? 'Joining…' : 'Join Falmouth for Intentional Tech';
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = (errs) => '<ul>' + errs.map((e) => `<li>${esc(e)}</li>`).join('') + '</ul>';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors();
    if (!endpoint) return;

    const data = Object.fromEntries(new FormData(form).entries());
    data.send_invite = data.send_invite === 'true';

    // Client-side validation (the Worker re-checks everything).
    const errs = [];
    if (!data.first_name.trim()) { errs.push('First name is required.'); markInvalid('first_name'); }
    if (!data.email.trim()) { errs.push('Email is required.'); markInvalid('email'); }
    else if (!EMAIL_RE.test(data.email.trim())) { errs.push('Please enter a valid email address.'); markInvalid('email'); }
    if (data.zip_code.trim() && !/^\d{5}(-\d{4})?$/.test(data.zip_code.trim())) { errs.push('ZIP code should be 5 digits.'); markInvalid('zip_code'); }
    if (errs.length) {
      show('error', '<strong>Please fix the following:</strong>' + list(errs));
      form.querySelector('[aria-invalid]')?.focus();
      return;
    }

    setLoading(true);
    show('info', 'Sending…');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      let body = {};
      try { body = await res.json(); } catch { /* ignore */ }

      if (res.ok) {
        form.hidden = true;
        success.hidden = false;
        success.querySelector('.success-invite').hidden = !data.send_invite;
        success.querySelector('.success-lead').hidden = data.send_invite;
        success.focus();
        return;
      }
      if (res.status === 422 || res.status === 400) {
        const errors = body.errors && body.errors.length ? body.errors : ['Some details could not be accepted.'];
        if (errors.some((x) => /email/i.test(x))) markInvalid('email');
        show('error', '<strong>We couldn\'t sign you up yet:</strong>' + list(errors));
        return;
      }
      throw new Error(body.error || `HTTP ${res.status}`);
    } catch (err) {
      console.error('Signup failed', err);
      show('error', `Something went wrong on our end. Please try again in a minute, or <a href="${fallback}" target="_blank" rel="noopener">join directly on Four Norms</a>.`);
    } finally {
      setLoading(false);
    }
  });
})();
