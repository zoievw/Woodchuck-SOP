// GET /api/entries — returns all quality-feedback submissions from Blob storage.
import { get } from '@vercel/blob';

const STORE_FILE = 'submissions.json';

export default async function handler(req, res) {
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
