// GET  /api/shipped — orders-shipped count per month ({ "2026-10": 412, ... }).
// POST /api/shipped — { entries: { "2026-10": 412, "2026-11": null } } saves or clears months.
// Both require the passcode (X-Passcode), the same one used for submissions.
import { get, put } from '@vercel/blob';

const STORE_FILE = 'shipped-counts.json';

async function readCounts() {
  const r = await get(STORE_FILE, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return {};
  try {
    const d = JSON.parse(await new Response(r.stream).text());
    return d && typeof d.counts === 'object' && d.counts ? d.counts : {};
  } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const required = process.env.SUBMISSIONS_PASSCODE;
  if (!required) {
    res.status(403).json({ error: 'Reports are not enabled: no passcode is configured.' });
    return;
  }
  if ((req.headers['x-passcode'] || '') !== required) {
    res.status(401).json({ error: 'Invalid passcode.' });
    return;
  }
  try {
    if (req.method === 'GET') {
      res.status(200).json({ counts: await readCounts() });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    const entries = b && typeof b.entries === 'object' && b.entries ? b.entries : null;
    if (!entries) {
      res.status(400).json({ error: 'Nothing to save.' });
      return;
    }
    const counts = await readCounts();
    for (const [month, value] of Object.entries(entries)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        res.status(400).json({ error: 'Invalid month: ' + month });
        return;
      }
      if (value === null || value === '') { delete counts[month]; continue; }
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 10000000) {
        res.status(400).json({ error: 'Orders shipped must be a whole number.' });
        return;
      }
      counts[month] = n;
    }
    await put(STORE_FILE, JSON.stringify({ counts }), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    res.status(200).json({ counts });
  } catch (e) {
    res.status(500).json({ error: 'Failed to process request.', detail: String(e && e.message || e) });
  }
}
