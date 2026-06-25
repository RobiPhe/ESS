// api/auth.js — Login endpoint
// POST /api/auth  { username, password }
const supabase = require('./_db');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const { username, password } = body;

    if (!username || !password)
      return res.status(400).json({ error: 'Username dan password wajib diisi' });

    // 1. Cek system_users (admin/staff)
    const { data: sysUser, error: sysErr } = await supabase
      .from('system_users')
      .select('nik, username, role, name')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle(); // maybeSingle = tidak throw error jika tidak ada

    if (sysUser) {
      return res.status(200).json({
        type: 'sysuser',
        user: sysUser,
        employee: null
      });
    }

    // 2. Cek emp_users (karyawan)
    const { data: empUser, error: empErr } = await supabase
      .from('emp_users')
      .select('nik, username')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle();

    if (!empUser)
      return res.status(401).json({ error: 'Username atau password salah' });

    // Ambil data karyawan lengkap
    const { data: employee, error: eErr } = await supabase
      .from('employees')
      .select('*')
      .eq('nik', empUser.nik)
      .maybeSingle();

    if (!employee)
      return res.status(401).json({ error: 'Data karyawan tidak ditemukan' });

    // Cek apakah supervisor
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

  } catch (err) {
    console.error('auth error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
