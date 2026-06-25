// api/supervisors.js
const getSupabase = require('./_db');
const supabase = getSupabase();

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('supervisors')
        .select('id, nik, dept, level, position, employees!inner(name)')
        .order('dept').order('level');
      if (error) throw error;
      const result = (data || []).map(s => ({ id: s.id, nik: s.nik, dept: s.dept, level: s.level, position: s.position, name: s.employees?.name || '' }));
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { nik, dept, level, position } = req.body || {};
      if (!nik || !dept || !level) return res.status(400).json({ error: 'NIK, dept, level wajib' });
      const { error } = await supabase.from('supervisors').insert({ nik, dept, level, position });
      if (error) throw error;
      return res.status(201).json({ ok: true });
    }

    if (req.method === 'PUT') {
      const { id, nik, dept, level, position } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID wajib' });
      const { error } = await supabase.from('supervisors').update({ nik, dept, level, position }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID wajib' });
      const { error } = await supabase.from('supervisors').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('supervisors error:', err);
    return res.status(500).json({ error: err.message });
  }
};
