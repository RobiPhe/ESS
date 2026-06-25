// api/auth.js
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Trim URL untuk menghindari trailing slash atau spasi
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'ENV vars tidak lengkap', url: !!supabaseUrl, key: !!supabaseKey });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = req.body || {};
    const { username, password } = body;

    if (!username || !password)
      return res.status(400).json({ error: 'Username dan password wajib diisi' });

    // Cek system_users
    const { data: sysUsers, error: sysErr } = await supabase
      .from('system_users')
      .select('nik, username, role, name')
      .eq('username', username)
      .eq('password', password)
      .limit(1);

    if (sysErr) {
      return res.status(500).json({ 
        error: 'DB error sysuser: ' + sysErr.message,
        hint: sysErr.hint || '',
        url_used: supabaseUrl
      });
    }

    if (sysUsers && sysUsers.length > 0) {
      return res.status(200).json({
        type: 'sysuser',
        user: sysUsers[0],
        employee: null
      });
    }

    // Cek emp_users
    const { data: empUsers, error: empErr } = await supabase
      .from('emp_users')
      .select('nik, username')
      .eq('username', username)
      .eq('password', password)
      .limit(1);

    if (empErr) {
      return res.status(500).json({ error: 'DB error empuser: ' + empErr.message });
    }

    if (!empUsers || empUsers.length === 0)
      return res.status(401).json({ error: 'Username atau password salah' });

    const empUser = empUsers[0];

    // Ambil data karyawan
    const { data: employees, error: eErr } = await supabase
      .from('employees')
      .select('*')
      .eq('nik', empUser.nik)
      .limit(1);

    if (eErr) return res.status(500).json({ error: 'DB error employee: ' + eErr.message });
    if (!employees || employees.length === 0)
      return res.status(401).json({ error: 'Data karyawan tidak ditemukan' });

    const employee = employees[0];

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
