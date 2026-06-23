// api/auth.js — Login endpoint
// POST /api/auth  { username, password }
import supabase from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username dan password wajib diisi' });

  // 1. Cek system_users dulu (admin/staff)
  const { data: sysUser } = await supabase
    .from('system_users')
    .select('nik, username, role, name')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (sysUser) {
    return res.status(200).json({
      type: 'sysuser',
      user: sysUser,
      employee: null
    });
  }

  // 2. Cek emp_users (karyawan)
  const { data: empUser } = await supabase
    .from('emp_users')
    .select('nik, username')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (!empUser)
    return res.status(401).json({ error: 'Username atau password salah' });

  // Ambil data karyawan lengkap
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('nik', empUser.nik)
    .single();

  if (!employee)
    return res.status(401).json({ error: 'Data karyawan tidak ditemukan' });

  // Ambil data atasan (apakah karyawan ini juga seorang supervisor)
  const { data: supData } = await supabase
    .from('supervisors')
    .select('nik, dept, level, position')
    .eq('nik', empUser.nik);

  return res.status(200).json({
    type: 'employee',
    user: { nik: empUser.nik, username: empUser.username, role: 'employee' },
    employee,
    isSupervisor: (supData || []).length > 0
  });
}
