// api/password.js
// POST /api/password/change  { nik, type:'sysuser'|'employee', oldPassword, newPassword }
// POST /api/password/reset   { nik, type:'sysuser'|'employee' }  → reset ke '12345' (admin only)
import supabase from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { action, nik, type, oldPassword, newPassword } = req.body;

  // ── CHANGE PASSWORD (user sendiri) ──────────────────────────
  if (action === 'change') {
    if (!nik || !type || !oldPassword || !newPassword)
      return res.status(400).json({ error: 'Data tidak lengkap' });
    if (newPassword.length < 5)
      return res.status(400).json({ error: 'Password minimal 5 karakter' });

    const table = type === 'sysuser' ? 'system_users' : 'emp_users';

    // Verifikasi password lama
    const { data: existing } = await supabase
      .from(table).select('nik').eq('nik', nik).eq('password', oldPassword).single();

    if (!existing)
      return res.status(401).json({ error: 'Password lama salah' });

    const { error } = await supabase
      .from(table).update({ password: newPassword }).eq('nik', nik);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // ── RESET PASSWORD → 12345 (admin only) ─────────────────────
  if (action === 'reset') {
    if (!nik || !type)
      return res.status(400).json({ error: 'Data tidak lengkap' });

    const table = type === 'sysuser' ? 'system_users' : 'emp_users';

    const { error } = await supabase
      .from(table).update({ password: '12345' }).eq('nik', nik);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Action tidak dikenal' });
}
