// api/password.js
const getSupabase = require('./_db');
const supabase = getSupabase();

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, nik, type, oldPassword, newPassword } = req.body || {};
    const table = type === 'sysuser' ? 'system_users' : 'emp_users';

    if (action === 'change') {
      if (!nik || !oldPassword || !newPassword) return res.status(400).json({ error: 'Data tidak lengkap' });
      if (newPassword.length < 5) return res.status(400).json({ error: 'Password min 5 karakter' });
      const { data: existing } = await supabase.from(table).select('nik').eq('nik', nik).eq('password', oldPassword).maybeSingle();
      if (!existing) return res.status(401).json({ error: 'Password lama salah' });
      const { error } = await supabase.from(table).update({ password: newPassword }).eq('nik', nik);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'reset') {
      if (!nik) return res.status(400).json({ error: 'NIK wajib' });
      const { error } = await supabase.from(table).update({ password: '12345' }).eq('nik', nik);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Action tidak dikenal' });
  } catch (err) {
    console.error('password error:', err);
    return res.status(500).json({ error: err.message });
  }
};
