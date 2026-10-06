// Password-protected SOP editing. The passcode is checked on the server (api/sops.js).
let SOP_ADMIN_PASS = '';
let _adminPending = null;
let _edId = null;
let _edHtmlMode = false;

async function sopApi(body) {
  const r = await fetch('/api/sops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Passcode': SOP_ADMIN_PASS },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok && data.ok, data };
}

function adminAuthed(cb) {
  if (SOP_ADMIN_PASS) { cb(); return; }
  _adminPending = cb;
  openAdminPass();
}
function openAdminPass() {
  const i = document.getElementById('admin-pass-input');
  i.value = '';
  document.getElementById('admin-pass-msg').textContent = '';
  document.getElementById('admin-pass-overlay').classList.add('open');
  setTimeout(() => i.focus(), 60);
}
function closeAdminPass() {
  document.getElementById('admin-pass-overlay').classList.remove('open');
  _adminPending = null;
}
async function submitAdminPass() {
  const p = document.getElementById('admin-pass-input').value;
  const msg = document.getElementById('admin-pass-msg');
  if (!p) { msg.textContent = 'Enter the passcode.'; return; }
  msg.textContent = 'Checking…';
  SOP_ADMIN_PASS = p;
  let res;
  try { res = await sopApi({ action: 'verify' }); }
  catch (e) { SOP_ADMIN_PASS = ''; msg.textContent = 'Could not reach the server.'; return; }
  if (res.ok) {
    const cb = _adminPending;
    document.getElementById('admin-pass-overlay').classList.remove('open');
    _adminPending = null;
    if (cb) cb();
  } else {
    SOP_ADMIN_PASS = '';
    msg.textContent = res.status === 401 ? 'Incorrect passcode.' : (res.data.error || 'Something went wrong.');
  }
}

function requestEdit(id) { adminAuthed(() => openEditor(id)); }
function requestCreate() { adminAuthed(() => openEditor(null)); }

function openEditor(id) {
  const card = id == null ? null : getAllCards().find(c => c.id === id);
  if (id != null && !card) return;
  if (card && card.isCustom) { alert("This is a local-only card and can't be edited here."); return; }
  _edId = id;
  closeDrawer();
  document.getElementById('editor-title').textContent = card ? 'Edit SOP' : 'Create new SOP';
  document.getElementById('ed-title').value = card ? card.title.replace(/&amp;/g, '&') : '';
  const sel = document.getElementById('ed-cat');
  const cats = Object.keys(CATS);
  sel.innerHTML = cats.map(c => `<option value="${c.replace(/"/g, '&quot;')}">${c.replace(/&/g, '&amp;')}</option>`).join('');
  sel.value = card && cats.includes(card.cat) ? card.cat : cats[0];
  document.getElementById('ed-tags').value = card ? (card.tags || []).join(', ') : '';
  const showRoles = !card || card.isAdded;
  document.getElementById('ed-roles-wrap').style.display = showRoles ? '' : 'none';
  document.querySelectorAll('.ed-role').forEach(cb => { cb.checked = !!(card && card.roles && card.roles.includes(cb.value)); });
  const ed = document.getElementById('ed-body');
  ed.innerHTML = card ? card.body : '<p></p>';
  _edHtmlMode = false;
  ed.style.display = '';
  document.getElementById('ed-html').style.display = 'none';
  document.getElementById('ed-html-btn').classList.remove('on');
  document.getElementById('ed-revert').style.display = card && card.edited ? '' : 'none';
  document.getElementById('ed-delete').style.display = card && card.isAdded ? '' : 'none';
  document.getElementById('ed-msg').textContent = '';
  document.getElementById('ed-save').disabled = false;
  document.getElementById('ed-save').textContent = 'Save SOP';
  document.getElementById('editor-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.querySelector('#editor-overlay .editor-scroll').scrollTop = 0;
}
function closeEditor() {
  document.getElementById('editor-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function edCmd(cmd, val) {
  if (_edHtmlMode) return;
  document.getElementById('ed-body').focus();
  document.execCommand(cmd, false, cmd === 'formatBlock' ? '<' + val + '>' : (val || null));
}

function edCallout(kind) {
  if (_edHtmlMode) return;
  const ed = document.getElementById('ed-body');
  ed.focus();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  let n = sel.anchorNode;
  if (n && n.nodeType === 3) n = n.parentNode;
  while (n && n.parentNode !== ed) n = n.parentNode;
  if (!n) { document.execCommand('formatBlock', false, '<p>'); return; }
  if (n.classList && n.classList.contains('alert')) {
    if (kind === 'none') {
      const p = document.createElement('p');
      p.innerHTML = n.innerHTML;
      ed.replaceChild(p, n);
    } else {
      n.className = 'alert ' + kind;
    }
  } else if (kind !== 'none') {
    const w = document.createElement('div');
    w.className = 'alert ' + kind;
    if (/^(UL|OL|TABLE)$/.test(n.tagName)) { ed.replaceChild(w, n); w.appendChild(n); }
    else { w.innerHTML = n.innerHTML; ed.replaceChild(w, n); }
  }
}

function edToggleHtml() {
  const ed = document.getElementById('ed-body');
  const ta = document.getElementById('ed-html');
  const btn = document.getElementById('ed-html-btn');
  if (!_edHtmlMode) {
    ta.value = ed.innerHTML;
    ed.style.display = 'none';
    ta.style.display = 'block';
    btn.classList.add('on');
    _edHtmlMode = true;
  } else {
    ed.innerHTML = ta.value;
    ta.style.display = 'none';
    ed.style.display = '';
    btn.classList.remove('on');
    _edHtmlMode = false;
  }
}

function edBodyHtml() {
  return (_edHtmlMode ? document.getElementById('ed-html').value : document.getElementById('ed-body').innerHTML).trim();
}

async function saveEditor() {
  const msg = document.getElementById('ed-msg');
  const title = document.getElementById('ed-title').value.trim();
  const cat = document.getElementById('ed-cat').value;
  const tags = document.getElementById('ed-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const rolesVisible = document.getElementById('ed-roles-wrap').style.display !== 'none';
  const roles = rolesVisible ? [...document.querySelectorAll('.ed-role:checked')].map(cb => cb.value) : [];
  const body = edBodyHtml();
  if (!title) { msg.textContent = 'Please add a title.'; return; }
  if (!body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()) { msg.textContent = 'Please add some content.'; return; }
  if (/href\s*=\s*["']?\s*(https?:)?\/\//i.test(body)) {
    msg.textContent = 'External links are not allowed — type the information directly into the SOP.';
    return;
  }
  const btn = document.getElementById('ed-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  msg.textContent = '';
  try {
    const res = await sopApi({ action: 'save', id: _edId, sop: { title, cat, tags, roles, body } });
    if (res.status === 401) { SOP_ADMIN_PASS = ''; msg.textContent = 'Your passcode is no longer valid — close this window and unlock again.'; }
    else if (!res.ok) { msg.textContent = res.data.error || 'Could not save. Please try again.'; }
    else {
      SOP_REMOTE = { edits: res.data.store.edits || {}, added: res.data.store.added || [], deleted: res.data.store.deleted || [] };
      closeEditor();
      renderAll();
      openCard(res.data.id);
      return;
    }
  } catch (e) {
    msg.textContent = 'Could not reach the server. Please try again.';
  }
  btn.disabled = false;
  btn.textContent = 'Save SOP';
}

async function edRevert() {
  if (!confirm('Revert this SOP to the original version? Your edits to it will be lost.')) return;
  const msg = document.getElementById('ed-msg');
  try {
    const res = await sopApi({ action: 'revert', id: _edId });
    if (!res.ok) { msg.textContent = res.data.error || 'Could not revert.'; return; }
    SOP_REMOTE = { edits: res.data.store.edits || {}, added: res.data.store.added || [], deleted: res.data.store.deleted || [] };
    const id = _edId;
    closeEditor();
    renderAll();
    openCard(id);
  } catch (e) { msg.textContent = 'Could not reach the server.'; }
}

async function edDelete() {
  if (!confirm('Delete this SOP for everyone? This cannot be undone.')) return;
  const msg = document.getElementById('ed-msg');
  try {
    const res = await sopApi({ action: 'delete', id: _edId });
    if (!res.ok) { msg.textContent = res.data.error || 'Could not delete.'; return; }
    SOP_REMOTE = { edits: res.data.store.edits || {}, added: res.data.store.added || [], deleted: res.data.store.deleted || [] };
    closeEditor();
    renderAll();
  } catch (e) { msg.textContent = 'Could not reach the server.'; }
}

(function () {
  const ed = document.getElementById('ed-body');
  // Stop inline click handlers inside SOP content from firing while editing, and never follow links.
  ed.addEventListener('click', e => { if (e.target.closest('a')) e.preventDefault(); e.stopPropagation(); }, true);
  // Paste as plain text so pasted web/Word content (and its links) can't sneak in.
  ed.addEventListener('paste', e => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('admin-pass-overlay').classList.contains('open')) closeAdminPass();
  });
})();
