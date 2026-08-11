// GET /api/entries — returns all quality-feedback submissions from Blob storage.
import { list } from '@vercel/blob';

const STORE_FILE = 'submissions.json';

export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: STORE_FILE, limit: 1 });
    if (!blobs.length) {
      res.status(200).json({ submissions: [] });
      return;
    }
    const r = await fetch(blobs[0].url, { cache: 'no-store' });
    const data = await r.json().catch(() => []);
    res.status(200).json({ submissions: Array.isArray(data) ? data : [] });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load submissions.', detail: String(e && e.message || e) });
  }
}
