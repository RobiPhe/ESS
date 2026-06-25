// api/sysusers.js
const supabase = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('system_users').select('nik, username, role, name, created_at').order('created_at');
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { name, username, password, role } = req.body || {};
      if (!name || !username) return res.status(400).json({ error: 'Nama dan username wajib' });
      if ((password || '').length < 5) return res.status(400).json({ error: 'Password min 5 karakter' });
      const nik = 'SYS' + Date.now().toString().slice(-4) + Math.floor(Math.random() * 90 + 10);
      const { error } = await supabase.from('system_users').insert({ nik, name, username, password: password || '12345', role: role || 'staff' });
      if (error) throw error;
      return res.status(201).json({ ok: true, nik });
    }

    if (req.method === 'PUT') {
      const { nik, name, username, role } = req.body || {};
      if (!nik) return res.status(400).json({ error: 'NIK wajib' });
      const { error } = await supabase.from('system_users').update({ name, username, role }).eq('nik', nik);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { nik } = req.query;
      if (!nik) return res.status(400).json({ error: 'NIK wajib' });
      const { error } = await supabase.from('system_users').delete().eq('nik', nik);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('sysusers error:', err);
    return res.status(500).json({ error: err.message });
  }
};
