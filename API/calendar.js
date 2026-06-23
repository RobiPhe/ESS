// api/calendar.js
// GET    /api/calendar?year=2025      → hari libur tahun tertentu
// POST   /api/calendar                → tambah/upload hari libur (bulk)
// DELETE /api/calendar?year=2025      → hapus semua libur tahun tersebut
import supabase from './_db.js';

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { year } = req.query;
    let q = supabase.from('work_calendar').select('date, description').order('date');
    if (year) q = q.eq('year', parseInt(year));
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    // Return sebagai object { 'YYYY-MM-DD': 'description' }
    const result = {};
    (data || []).forEach(r => { result[r.date] = r.description || '' });
    return res.status(200).json(result);
  }

  if (req.method === 'POST') {
    // body: { year: 2025, holidays: { 'YYYY-MM-DD': 'desc', ... } }
    const { year, holidays } = req.body;
    if (!year || !holidays)
      return res.status(400).json({ error: 'year dan holidays wajib diisi' });

    // Hapus dulu semua yang lama untuk tahun ini
    await supabase.from('work_calendar').delete().eq('year', parseInt(year));

    const rows = Object.entries(holidays).map(([date, description]) => ({
      year: parseInt(year), date, description: description || ''
    }));

    if (!rows.length) return res.status(200).json({ ok: true, inserted: 0 });

    const { error } = await supabase.from('work_calendar').insert(rows);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, inserted: rows.length });
  }

  if (req.method === 'DELETE') {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year wajib diisi' });
    const { error } = await supabase.from('work_calendar').delete().eq('year', parseInt(year));
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
