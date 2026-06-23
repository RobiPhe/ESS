// api/employees.js
// GET    /api/employees            → semua karyawan
// POST   /api/employees            → tambah karyawan baru
// PUT    /api/employees            → update karyawan (body: { nik, ...fields })
// DELETE /api/employees?nik=xxx   → hapus karyawan
import supabase from './_db.js';

export default async function handler(req, res) {

  // ── GET: ambil semua karyawan ────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('name');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── POST: tambah karyawan baru ───────────────────────────────
  if (req.method === 'POST') {
    const { nik, name, dept, status, join_date, permanent_date,
            ann_y1, ann_y2, ann_y3, big_leave, username, password } = req.body;

    if (!nik || !name || !dept)
      return res.status(400).json({ error: 'NIK, nama, dan departemen wajib diisi' });

    // Cek NIK duplikat
    const { data: existing } = await supabase
      .from('employees').select('nik').eq('nik', nik).single();
    if (existing)
      return res.status(409).json({ error: 'NIK sudah terdaftar' });

    // Insert karyawan
    const { error: empErr } = await supabase.from('employees').insert({
      nik, name, dept, status: status || 'kontrak',
      join_date: join_date || null,
      permanent_date: permanent_date || null,
      ann_y1: ann_y1 || 0, ann_y2: ann_y2 || 0,
      ann_y3: ann_y3 || 0, big_leave: big_leave || 0
    });
    if (empErr) return res.status(500).json({ error: empErr.message });

    // Cek username duplikat
    const { data: uExist } = await supabase
      .from('emp_users').select('nik').eq('username', username).single();
    if (uExist)
      return res.status(409).json({ error: 'Username sudah digunakan' });

    // Insert user credentials
    const { error: userErr } = await supabase.from('emp_users').insert({
      nik, username: username || nik, password: password || '12345'
    });
    if (userErr) return res.status(500).json({ error: userErr.message });

    return res.status(201).json({ ok: true });
  }

  // ── PUT: update data karyawan ────────────────────────────────
  if (req.method === 'PUT') {
    const { nik, username, password, ...fields } = req.body;
    if (!nik) return res.status(400).json({ error: 'NIK wajib diisi' });

    // Update employees table
    const empFields = {};
    const allowed = ['name','dept','status','join_date','permanent_date',
                     'ann_y1','ann_y2','ann_y3','big_leave'];
    allowed.forEach(k => { if (fields[k] !== undefined) empFields[k] = fields[k] });

    if (Object.keys(empFields).length > 0) {
      const { error } = await supabase.from('employees').update(empFields).eq('nik', nik);
      if (error) return res.status(500).json({ error: error.message });
    }

    // Update username / password jika ada
    if (username || password) {
      const userFields = {};
      if (username) userFields.username = username;
      if (password) userFields.password = password;
      const { error } = await supabase.from('emp_users').update(userFields).eq('nik', nik);
      if (error) return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  // ── DELETE: hapus karyawan ───────────────────────────────────
  if (req.method === 'DELETE') {
    const { nik } = req.query;
    if (!nik) return res.status(400).json({ error: 'NIK wajib diisi' });

    // emp_users akan terhapus otomatis via CASCADE
    const { error } = await supabase.from('employees').delete().eq('nik', nik);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
