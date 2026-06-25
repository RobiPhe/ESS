// api/departments.js
const supabase = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('departments').select('name').order('name');
      if (error) throw error;
      return res.status(200).json((data || []).map(d => d.name));
    }

    if (req.method === 'POST') {
      const { name } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Nama wajib' });
      const { error } = await supabase.from('departments').insert({ name });
      if (error) throw error;
      return res.status(201).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { name } = req.query;
      if (!name) return res.status(400).json({ error: 'Nama wajib' });
      const { error } = await supabase.from('departments').delete().eq('name', name);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('departments error:', err);
    return res.status(500).json({ error: err.message });
  }
};
