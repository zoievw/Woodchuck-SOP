// POST /api/submit — appends one quality-feedback submission to Blob storage.
import { get, put } from '@vercel/blob';

const STORE_FILE = 'submissions.json';

async function readAll() {
  const result = await get(STORE_FILE, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return [];
  const text = await new Response(result.stream).text();
  try { const d = JSON.parse(text); return Array.isArray(d) ? d : []; } catch { return []; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    if (!b || typeof b !== 'object') b = {};

    const project_name = (b.project_name || '').toString().trim();
    const order_number = (b.order_number || '').toString().trim();
    const quality_issue = (b.quality_issue || '').toString().trim();
    if (!project_name || !order_number || !quality_issue) {
      res.status(400).json({ error: 'Project/customer, order #, and issue description are required.' });
      return;
    }

    const entry = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      date: b.date || null,
      project_name,
      order_number,
      quality_issue,
      category: b.category || null,
      severity: b.severity ? parseInt(b.severity, 10) : null,
      dollar_impact: (b.dollar_impact !== null && b.dollar_impact !== undefined && b.dollar_impact !== '')
        ? parseFloat(b.dollar_impact) : null,
      reported_by: (b.reported_by || '').toString().trim() || null,
      comments: (b.comments || '').toString().trim() || null,
    };

    const submissions = await readAll();
    submissions.push(entry);

    await put(STORE_FILE, JSON.stringify(submissions), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });

    res.status(200).json({ success: true, entry });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save submission.', detail: String(e && e.message || e) });
  }
}
