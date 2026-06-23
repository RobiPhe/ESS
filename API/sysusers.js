// api/sysusers.js
// GET    /api/sysusers          → semua system users
// POST   /api/sysusers          → tambah admin/staff baru
// PUT    /api/sysusers          → edit (body: { nik, name, username, role })
// DELETE /api/sysusers?nik=xxx  → hapus
import supabase from './_db.js';

export default async function handler(req, res) {

  // ── GET ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('system_users')
      .select('nik, username, role, name, created_at')
      .order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── POST: tambah user baru ───────────────────────────────────
  if (req.method === 'POST') {
    const { name, username, password, role } = req.body;
    if (!name || !username)
      return res.status(400).json({ error: 'Nama dan username wajib diisi' });
    if ((password || '').length < 5)
      return res.status(400).json({ error: 'Password minimal 5 karakter' });

    // Cek username duplikat di sysusers
    const { data: s } = await supabase
      .from('system_users').select('nik').eq('username', username).single();
    if (s) return res.status(409).json({ error: 'Username sudah digunakan' });

    // Cek username duplikat di emp_users
    const { data: e } = await supabase
      .from('emp_users').select('nik').eq('username', username).single();
    if (e) return res.status(409).json({ error: 'Username sudah digunakan oleh karyawan' });

    // Generate NIK SYS
    const nik = 'SYS' + Date.now().toString().slice(-4) +
                Math.floor(Math.random() * 90 + 10);

    const { error } = await supabase.from('system_users').insert({
      nik, name, username,
      password: password || '12345',
      role: role || 'staff'
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true, nik });
  }

  // ── PUT: edit user ───────────────────────────────────────────
  if (req.method === 'PUT') {
    const { nik, name, username, role } = req.body;
    if (!nik) return res.status(400).json({ error: 'NIK wajib diisi' });

    // Cek konflik username (exclude self)
    if (username) {
      const { data: conflict } = await supabase
        .from('system_users').select('nik').eq('username', username).neq('nik', nik).single();
      if (conflict) return res.status(409).json({ error: 'Username sudah digunakan' });
    }

    const { error } = await supabase
      .from('system_users')
      .update({ name, username, role })
      .eq('nik', nik);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // ── DELETE ───────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { nik } = req.query;
    if (!nik) return res.status(400).json({ error: 'NIK wajib diisi' });
    const { error } = await supabase.from('system_users').delete().eq('nik', nik);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
