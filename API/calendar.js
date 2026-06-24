// api/calendar.js
const supabase = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { year } = req.query;
      let q = supabase.from('work_calendar').select('date, description').order('date');
      if (year) q = q.eq('year', parseInt(year));
      const { data, error } = await q;
      if (error) throw error;
      const result = {};
      (data || []).forEach(r => { result[r.date] = r.description || ''; });
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { year, holidays } = req.body || {};
      if (!year || !holidays) return res.status(400).json({ error: 'year dan holidays wajib' });
      await supabase.from('work_calendar').delete().eq('year', parseInt(year));
      const rows = Object.entries(holidays).map(([date, description]) => ({ year: parseInt(year), date, description: description || '' }));
      if (!rows.length) return res.status(200).json({ ok: true, inserted: 0 });
      const { error } = await supabase.from('work_calendar').insert(rows);
      if (error) throw error;
      return res.status(200).json({ ok: true, inserted: rows.length });
    }

    if (req.method === 'DELETE') {
      const { year } = req.query;
      if (!year) return res.status(400).json({ error: 'year wajib' });
      const { error } = await supabase.from('work_calendar').delete().eq('year', parseInt(year));
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('calendar error:', err);
    return res.status(500).json({ error: err.message });
  }
};
