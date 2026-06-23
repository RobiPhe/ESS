// api/supervisors.js
// GET    /api/supervisors          → semua data atasan
// POST   /api/supervisors          → tambah atasan
// PUT    /api/supervisors          → update atasan
// DELETE /api/supervisors?id=xxx   → hapus
import supabase from './_db.js';

export default async function handler(req, res) {

  // ── GET ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('supervisors')
      .select(`
        id, nik, dept, level, position,
        employees!inner(name)
      `)
      .order('dept').order('level');
    if (error) return res.status(500).json({ error: error.message });

    // Flatten nama dari join
    const result = (data || []).map(s => ({
      id: s.id, nik: s.nik, dept: s.dept,
      level: s.level, position: s.position,
      name: s.employees?.name || ''
    }));
    return res.status(200).json(result);
  }

  // ── POST: tambah atasan ──────────────────────────────────────
  if (req.method === 'POST') {
    const { nik, dept, level, position } = req.body;
    if (!nik || !dept || !level)
      return res.status(400).json({ error: 'NIK, dept, level wajib diisi' });

    // Cek duplikat
    const { data: existing } = await supabase
      .from('supervisors').select('id').eq('nik', nik).eq('dept', dept).eq('level', level).single();
    if (existing)
      return res.status(409).json({ error: 'Atasan ini sudah terdaftar di level dan dept yang sama' });

    const { error } = await supabase.from('supervisors').insert({ nik, dept, level, position });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  // ── PUT: update atasan ───────────────────────────────────────
  if (req.method === 'PUT') {
    const { id, nik, dept, level, position } = req.body;
    if (!id) return res.status(400).json({ error: 'ID wajib diisi' });

    const { error } = await supabase
      .from('supervisors').update({ nik, dept, level, position }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // ── DELETE ───────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID wajib diisi' });
    const { error } = await supabase.from('supervisors').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
