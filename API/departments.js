// api/departments.js
// GET    /api/departments         → list semua dept
// POST   /api/departments         → tambah dept
// DELETE /api/departments?name=   → hapus dept
import supabase from './_db.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('departments').select('name').order('name');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json((data || []).map(d => d.name));
  }

  if (req.method === 'POST') {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama departemen wajib diisi' });
    const { error } = await supabase.from('departments').insert({ name });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { name } = req.query;
    const { error } = await supabase.from('departments').delete().eq('name', name);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
