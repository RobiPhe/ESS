// api/biglog.js
// GET  /api/biglog?empNik=xxx   → log satu karyawan
// GET  /api/biglog?all=1        → semua log (admin)
// POST /api/biglog               → tambah log entry
import supabase from './_db.js';

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { empNik, all } = req.query;

    if (all === '1') {
      const { data, error } = await supabase
        .from('big_leave_log').select('*, employees(name, dept)')
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (empNik) {
      const { data, error } = await supabase
        .from('big_leave_log').select('*').eq('emp_nik', empNik)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Parameter kurang' });
  }

  if (req.method === 'POST') {
    const { emp_nik, type, amount, note, log_date } = req.body;
    if (!emp_nik || !type)
      return res.status(400).json({ error: 'emp_nik dan type wajib diisi' });
    const { error } = await supabase.from('big_leave_log').insert({
      emp_nik, type, amount: amount || 0,
      note: note || '',
      log_date: log_date || new Date().toISOString().split('T')[0]
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
