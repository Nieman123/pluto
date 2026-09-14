async function post(path, body, token) {
  const response = await fetch(`/manafest-waiver/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const message = await response.json().catch(() => ({}));
    const error = new Error(message.error || 'The request could not be confirmed. Please retry.');
    error.status = response.status; throw error;
  }
  return response;
}
async function download(path, body, token) {
  const response = await post(path, body, token);
  if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('A PDF was not returned. Please retry.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'ManaFest-2026-signed-waiver.pdf';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function initWaiver() {
  const form = document.querySelector('#waiver-form');
  if (!form) return;
  const canvas = document.querySelector('#signature-canvas'), ctx = canvas.getContext('2d');
  const submit = document.querySelector('#waiver-submit'), error = document.querySelector('#waiver-error');
  const inputs = document.querySelector('#waiver-inputs');
  let strokes = [], activeStroke, activePointer, requestBody, busy = false, completed = false;
  const receiptKey = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
  submit.disabled = false;
  function paint() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#241d29';
    for (const stroke of strokes) {
      ctx.beginPath(); stroke.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x * canvas.width, p.y * canvas.height)); ctx.stroke();
    }
  }
  function point(event) {
    const box = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  }
  canvas.addEventListener('pointerdown', event => {
    if (inputs.disabled || activePointer !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (strokes.length >= 100) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId); activePointer = event.pointerId;
    activeStroke = [point(event)]; strokes.push(activeStroke);
  });
  canvas.addEventListener('pointermove', event => {
    if (!activeStroke || event.pointerId !== activePointer || inputs.disabled) return;
    if (strokes.reduce((n, s) => n + s.length, 0) >= 5000) return;
    activeStroke.push(point(event)); paint();
  });
  function finishStroke(event) {
    if (event.pointerId !== activePointer) return;
    if (activeStroke?.length < 2) strokes.pop();
    activeStroke = undefined; activePointer = undefined; paint();
    document.querySelector('#signature-state').textContent = strokes.length ? 'Signature drawn' : 'No signature drawn';
  }
  canvas.addEventListener('pointerup', finishStroke); canvas.addEventListener('pointercancel', finishStroke);
  document.querySelector('#clear-signature').addEventListener('click', () => {
    strokes = []; activeStroke = undefined; activePointer = undefined; paint(); document.querySelector('#signature-state').textContent = 'No signature drawn';
  });
  form.querySelectorAll('[name="signatureMethod"]').forEach(radio => radio.addEventListener('change', () => {
    const typed = radio.value === 'typed';
    document.querySelector('#drawn-signature').hidden = typed;
    document.querySelector('#typed-signature').hidden = !typed;
    form.elements.typedSignature.disabled = !typed; form.elements.typedSignature.required = typed;
    if (typed) form.elements.typedSignature.focus();
  }));
  window.addEventListener('beforeunload', event => {
    if (requestBody && !completed) { event.preventDefault(); event.returnValue = ''; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || completed) return;
    error.hidden = true;
    if (!requestBody) {
      if (!form.reportValidity()) return;
      const data = new FormData(form), typed = data.get('signatureMethod') === 'typed';
      if (!typed && (strokes.flat().length < 5 || strokes.reduce((total, s) => total + s.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - s[i].x, p.y - s[i].y), 0), 0) < 0.08)) {
        error.textContent = 'Draw a complete signature, or choose the typed-signature alternative.'; error.hidden = false; error.focus(); return;
      }
      if (typed && String(data.get('typedSignature')).trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase() !== String(data.get('fullName')).trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()) {
        error.textContent = 'Your typed signature must match your full legal name.'; error.hidden = false; error.focus(); return;
      }
      requestBody = {
        receiptKey, version: form.dataset.version, documentHash: form.dataset.documentHash, consentVersion: form.dataset.consentVersion,
        ...Object.fromEntries(['fullName', 'email', 'phone', 'emergencyName', 'emergencyRelationship', 'emergencyPhone', 'website'].map(key => [key, data.get(key)])),
        acknowledgments: Object.fromEntries(['adult', 'agreement', 'electronic'].map(key => [key, data.get(key) === 'on'])),
        signature: typed ? { type: 'typed', text: data.get('typedSignature') } : { type: 'drawn', strokes: structuredClone(strokes) },
      };
    }
    busy = true; submit.disabled = true; inputs.disabled = true;
    document.querySelector('#waiver-progress').textContent = 'Saving your waiver and signed PDF. Keep this page open…';
    try {
      const result = await (await post('submit', requestBody)).json();
      if (result.status !== 'completed' || !/^MF26-[A-F0-9-]{36}$/.test(result.confirmationId)) throw new Error('Completion was not confirmed. Retry this signing attempt.');
      completed = true; form.hidden = true;
      document.querySelector('#confirmation-number').textContent = result.confirmationId;
      document.querySelector('#confirmation-time').textContent = result.signedAtUtc;
      const confirmation = document.querySelector('#waiver-confirmation'); confirmation.hidden = false; confirmation.focus();
    } catch (err) {
      // Only explicit validation rejection permits editing. Network/5xx/409 outcomes retain the exact original payload.
      if ([400, 413, 415].includes(err.status)) { requestBody = undefined; inputs.disabled = false; }
      error.textContent = err.status ? err.message : 'Saving could not be confirmed because the connection failed. Keep this page open and retry; the same signing attempt will be reused.';
      error.hidden = false; error.focus();
      submit.textContent = requestBody ? 'Retry signing submission' : 'Sign and submit waiver';
    } finally { busy = false; submit.disabled = false; document.querySelector('#waiver-progress').textContent = ''; }
  });
  document.querySelector('#download-waiver').addEventListener('click', async event => {
    const status = document.querySelector('#download-status'); event.target.disabled = true; status.textContent = 'Preparing your download…';
    try { await download('download', { receiptKey }); status.textContent = 'Download started. Save your PDF somewhere private.'; }
    catch (err) { status.textContent = `Your waiver is saved, but the download failed. ${err.status ? err.message : 'Please try downloading again.'}`; }
    finally { event.target.disabled = false; }
  });
}

export function initStaff() {
  if (!document.querySelector('[data-waiver-staff]')) return;
  const status = document.querySelector('#staff-status'), tools = document.querySelector('#staff-tools'), results = document.querySelector('#staff-results'), resultsStatus = document.querySelector('#staff-results-status');
  let user, generation = 0;
  async function checkAccess(nextUser) {
    user = nextUser; const current = ++generation; tools.hidden = true; results.replaceChildren(); resultsStatus.textContent = '';
    document.querySelector('#staff-sign-in').hidden = Boolean(user);
    if (!user) { status.textContent = 'Sign in with an authorized staff account.'; return; }
    status.textContent = 'Checking your staff access…';
    try {
      await post('staff/access', {}, await user.getIdToken());
      if (current !== generation) return;
      tools.hidden = false; status.textContent = 'Staff access verified. Searches and downloads are recorded.';
    } catch (err) { if (current === generation) status.textContent = err.status ? err.message : 'Staff access could not be checked. Please reload and try again.'; }
  }
  window.addEventListener('pluto-auth', event => {
    const previewLogin = document.querySelector('#preview-staff-login');
    if (previewLogin) previewLogin.disabled = false;
    checkAccess(event.detail);
  });
  document.querySelector('#preview-staff-login')?.addEventListener('click', async event => {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
    event.target.disabled = true;
    try {
      const { getAuth, signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
      const auth = getAuth();
      if (!auth.emulatorConfig) throw new Error('Local authentication emulator required.');
      await signInWithEmailAndPassword(auth, 'staff@waiver-preview.invalid', 'Local-preview-only-2026!');
    } catch { status.textContent = 'The local test account is unavailable. Run the waiver preview seed script, then try again.'; }
    finally { event.target.disabled = false; }
  });
  window.addEventListener('pluto-auth-error', () => { status.textContent = 'Sign-in services could not load. Check your connection and reload this page.'; document.querySelector('#staff-sign-in').hidden = false; });
  document.querySelector('#staff-recheck').addEventListener('click', () => location.reload());
  document.querySelector('#staff-search').addEventListener('submit', async event => {
    event.preventDefault(); if (!user) return;
    const current = ++generation, activeUser = user, button = event.target.querySelector('button');
    results.replaceChildren(); button.disabled = true; resultsStatus.textContent = 'Searching completed waivers…';
    try {
      const data = await (await post('staff/search', { query: event.target.elements.query.value }, await activeUser.getIdToken())).json();
      if (current !== generation) return;
      resultsStatus.textContent = data.results.length ? `${data.results.length} completed waiver${data.results.length === 1 ? '' : 's'} found.${data.truncated ? ' More matches exist; enter more of the name, email, or number.' : ''}` : 'No completed waiver found. Try the attendee’s full name, email, or confirmation number.';
      for (const record of data.results) {
        const li = document.createElement('li'), heading = document.createElement('h2'), details = document.createElement('p'), downloadButton = document.createElement('button');
        heading.textContent = record.fullName; details.textContent = `${record.email}\nCompleted · ${record.signedAtUtc}\n${record.confirmationId}`;
        downloadButton.type = 'button'; downloadButton.className = 'button button-quiet'; downloadButton.textContent = 'Download signed record';
        downloadButton.addEventListener('click', async () => {
          downloadButton.disabled = true;
          try { await download('staff/download', { confirmationId: record.confirmationId }, await activeUser.getIdToken()); resultsStatus.textContent = 'Download started. Handle this attendee record privately.'; }
          catch (err) { resultsStatus.textContent = err.status ? err.message : 'Download failed. Please retry.'; }
          finally { downloadButton.disabled = false; }
        });
        li.append(heading, details, downloadButton); results.append(li);
      }
    } catch (err) {
      if (current === generation) { resultsStatus.textContent = err.status ? err.message : 'Search failed. Please try again.'; if ([401, 403].includes(err.status)) { tools.hidden = true; status.textContent = err.message; } }
    } finally { button.disabled = false; }
  });
}
