// GET /api/entries — returns all quality-feedback submissions from Blob storage.
// Requires the correct passcode (via X-Passcode header) when SUBMISSIONS_PASSCODE is set.
import { get } from '@vercel/blob';

const STORE_FILE = 'submissions.json';

export default async function handler(req, res) {
  const required = process.env.SUBMISSIONS_PASSCODE;
  if (required) {
    const provided = req.headers['x-passcode'] || (req.query && req.query.passcode) || '';
    if (provided !== required) {
      res.status(401).json({ error: 'Invalid passcode.' });
      return;
    }
  }
  try {
    const result = await get(STORE_FILE, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      res.status(200).json({ submissions: [] });
      return;
    }
    const text = await new Response(result.stream).text();
    let data = [];
    try { data = JSON.parse(text); } catch { data = []; }
    res.status(200).json({ submissions: Array.isArray(data) ? data : [] });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load submissions.', detail: String(e && e.message || e) });
  }
}
