// api/employees.js
const supabase = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('employees').select('*').order('name');
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { nik, name, dept, status, join_date, permanent_date,
              ann_y1, ann_y2, ann_y3, big_leave, username, password } = req.body || {};
      if (!nik || !name || !dept)
        return res.status(400).json({ error: 'NIK, nama, dan departemen wajib diisi' });

      const { error: empErr } = await supabase.from('employees').insert({
        nik, name, dept, status: status || 'kontrak',
        join_date: join_date || null, permanent_date: permanent_date || null,
        ann_y1: ann_y1 || 0, ann_y2: ann_y2 || 0, ann_y3: ann_y3 || 0, big_leave: big_leave || 0
      });
      if (empErr) throw empErr;

      const { error: userErr } = await supabase.from('emp_users').insert({
        nik, username: username || nik, password: password || '12345'
      });
      if (userErr) throw userErr;

      return res.status(201).json({ ok: true });
    }

    if (req.method === 'PUT') {
      const { nik, username, password, ...rest } = req.body || {};
      if (!nik) return res.status(400).json({ error: 'NIK wajib' });

      const allowed = ['name','dept','status','join_date','permanent_date','ann_y1','ann_y2','ann_y3','big_leave'];
      const fields = {};
      allowed.forEach(k => { if (rest[k] !== undefined) fields[k] = rest[k]; });

      if (Object.keys(fields).length > 0) {
        const { error } = await supabase.from('employees').update(fields).eq('nik', nik);
        if (error) throw error;
      }
      if (username || password) {
        const uf = {};
        if (username) uf.username = username;
        if (password) uf.password = password;
        const { error } = await supabase.from('emp_users').update(uf).eq('nik', nik);
        if (error) throw error;
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { nik } = req.query;
      if (!nik) return res.status(400).json({ error: 'NIK wajib' });
      const { error } = await supabase.from('employees').delete().eq('nik', nik);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('employees error:', err);
    return res.status(500).json({ error: err.message });
  }
};
