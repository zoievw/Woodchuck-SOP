// GET  /api/sops — SOP edits, added SOPs, and deletions (public, read-only).
// POST /api/sops — verify | save | revert | delete (requires the edit passcode in X-Passcode).
import { get, put } from '@vercel/blob';

const STORE_FILE = 'sops-edits.json';
const ROLES = ['Sales', 'Design', 'Shipping', 'Finance'];

function fresh() { return { edits: {}, added: [], deleted: [] }; }

async function readStore() {
  const r = await get(STORE_FILE, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return fresh();
  try {
    const d = JSON.parse(await new Response(r.stream).text());
    return { edits: d.edits || {}, added: d.added || [], deleted: d.deleted || [] };
  } catch { return fresh(); }
}

async function writeStore(store) {
  await put(STORE_FILE, JSON.stringify(store), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
}

function cleanSop(sop) {
  if (!sop || typeof sop !== 'object') throw new Error('Missing SOP data.');
  const title = String(sop.title || '').trim().slice(0, 200);
  const cat = String(sop.cat || '').trim().slice(0, 80);
  let body = String(sop.body || '').trim();
  if (!title) throw new Error('Title is required.');
  if (!cat) throw new Error('Category is required.');
  if (!body) throw new Error('SOP content cannot be empty.');
  if (body.length > 300000) throw new Error('SOP content is too large.');
  if (/href\s*=\s*["']?\s*(https?:)?\/\//i.test(body) || /<(iframe|object|embed|form)\b/i.test(body)) {
    throw new Error('External links are not allowed in SOPs — put the information directly in the SOP.');
  }
  body = body.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/javascript:/gi, '');
  const tags = (Array.isArray(sop.tags) ? sop.tags : [])
    .map(t => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 40);
  const roles = (Array.isArray(sop.roles) ? sop.roles : []).filter(r => ROLES.includes(r));
  return { title, cat, tags, roles, body };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      res.status(200).json(await readStore());
    } catch (e) {
      res.status(500).json({ error: 'Failed to load SOP edits.', detail: String(e && e.message || e) });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const required = process.env.SOP_EDIT_PASSCODE || process.env.SUBMISSIONS_PASSCODE;
  if (!required) {
    res.status(403).json({ error: 'Editing is not enabled: no edit passcode is configured.' });
    return;
  }
  if ((req.headers['x-passcode'] || '') !== required) {
    res.status(401).json({ error: 'Incorrect passcode.' });
    return;
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  if (!b || typeof b !== 'object') b = {};

  try {
    if (b.action === 'verify') {
      res.status(200).json({ ok: true });
      return;
    }

    const store = await readStore();

    if (b.action === 'save') {
      const sop = cleanSop(b.sop);
      const updated = todayLabel();
      let id = b.id != null ? parseInt(b.id, 10) : null;
      if (id == null || Number.isNaN(id)) {
        const used = [100, ...store.added.map(a => a.id), ...store.deleted];
        id = Math.max(...used) + 1;
        store.added.push({ id, ...sop, updated });
      } else {
        const idx = store.added.findIndex(a => a.id === id);
        if (idx >= 0) store.added[idx] = { id, ...sop, updated };
        else store.edits[String(id)] = { title: sop.title, cat: sop.cat, tags: sop.tags, body: sop.body, updated };
      }
      await writeStore(store);
      res.status(200).json({ ok: true, id, store });
      return;
    }

    if (b.action === 'revert') {
      delete store.edits[String(parseInt(b.id, 10))];
      await writeStore(store);
      res.status(200).json({ ok: true, store });
      return;
    }

    if (b.action === 'delete') {
      const id = parseInt(b.id, 10);
      const before = store.added.length;
      store.added = store.added.filter(a => a.id !== id);
      if (store.added.length === before) {
        res.status(400).json({ error: 'Only SOPs you created can be deleted.' });
        return;
      }
      store.deleted.push(id);
      await writeStore(store);
      res.status(200).json({ ok: true, store });
      return;
    }

    res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    const msg = String(e && e.message || e);
    const known = /required|empty|too large|External links|Missing SOP/.test(msg);
    res.status(known ? 400 : 500).json({ error: known ? msg : 'Failed to save.', detail: known ? undefined : msg });
  }
}
