// api/leaves.js
// GET    /api/leaves?empNik=xxx          → cuti milik satu karyawan
// GET    /api/leaves?all=1               → semua cuti (admin)
// GET    /api/leaves?approverNik=xxx     → pending approval untuk atasan
// POST   /api/leaves                     → ajukan cuti baru
// PUT    /api/leaves                     → approve / reject / cancel
// DELETE /api/leaves?id=xxx              → hapus (admin)
import supabase from './_db.js';

export default async function handler(req, res) {

  // ── GET ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { empNik, all, approverNik } = req.query;

    // Semua cuti (admin dashboard)
    if (all === '1') {
      const { data, error } = await supabase
        .from('leaves').select('*').order('applied_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    // Cuti milik karyawan tertentu
    if (empNik) {
      const { data, error } = await supabase
        .from('leaves').select('*').eq('emp_nik', empNik)
        .order('applied_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    // Pending approval untuk satu atasan
    if (approverNik) {
      // Ambil dept yang dihandle atasan ini
      const { data: supDepts } = await supabase
        .from('supervisors').select('dept, level').eq('nik', approverNik);

      if (!supDepts || !supDepts.length)
        return res.status(200).json([]);

      // Ambil semua karyawan di dept tersebut
      const deptNames = [...new Set(supDepts.map(s => s.dept))];
      const { data: deptEmps } = await supabase
        .from('employees').select('nik, name, dept').in('dept', deptNames);

      const empNiks = (deptEmps || []).map(e => e.nik);
      if (!empNiks.length) return res.status(200).json([]);

      // Ambil leaves pending dari karyawan dept tersebut
      const { data: leaves, error } = await supabase
        .from('leaves').select('*')
        .in('emp_nik', empNiks)
        .in('status', ['pending', 'approved1'])
        .order('applied_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

      // Filter: hanya yang belum dia approve
      const filtered = (leaves || []).filter(l => {
        const sup = supDepts.find(s => {
          const emp = deptEmps.find(e => e.nik === l.emp_nik);
          return emp && s.dept === emp.dept;
        });
        if (!sup) return false;
        if (sup.level === 1 && l.status === 'pending' && l.approver1_nik === approverNik) return true;
        if (sup.level === 2 && l.status === 'approved1' && l.approver2_nik === approverNik) return true;
        return false;
      });

      return res.status(200).json(filtered);
    }

    return res.status(400).json({ error: 'Parameter kurang' });
  }

  // ── POST: ajukan cuti baru ───────────────────────────────────
  if (req.method === 'POST') {
    const { emp_nik, leave_type, dates, reason,
            approver1_nik, approver1_name, approver1_pos,
            approver2_nik, approver2_name, approver2_pos } = req.body;

    if (!emp_nik || !leave_type || !dates || !dates.length)
      return res.status(400).json({ error: 'Data tidak lengkap' });

    // Cek overlap tanggal
    const { data: emp } = await supabase
      .from('employees').select('dept').eq('nik', emp_nik).single();

    const { data: existing } = await supabase
      .from('leaves').select('dates, status').eq('emp_nik', emp_nik)
      .not('status', 'in', '("rejected","cancelled")');

    const overlap = (existing || []).some(l =>
      (l.dates || []).some(d => dates.includes(d))
    );
    if (overlap)
      return res.status(409).json({ error: 'Tanggal sudah ada pengajuan cuti aktif' });

    const id = crypto.randomUUID();
    const status = approver1_nik ? 'pending' : 'approved';

    const { error } = await supabase.from('leaves').insert({
      id, emp_nik, leave_type, dates, reason,
      status,
      approver1_nik, approver1_name, approver1_pos,
      approver2_nik, approver2_name, approver2_pos
    });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ ok: true, id });
  }

  // ── PUT: approve / reject / cancel ──────────────────────────
  if (req.method === 'PUT') {
    const { id, action, approver_nik, reason } = req.body;
    if (!id || !action)
      return res.status(400).json({ error: 'ID dan action wajib diisi' });

    const { data: leave } = await supabase
      .from('leaves').select('*').eq('id', id).single();
    if (!leave) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const now = new Date().toISOString();
    let update = {};

    if (action === 'approve1') {
      update = { status: leave.approver2_nik ? 'approved1' : 'approved', approved1_at: now };
    } else if (action === 'approve2') {
      update = { status: 'approved', approved2_at: now };
    } else if (action === 'reject1') {
      update = { status: 'rejected', rejected1_at: now, reject1_reason: reason || '' };
    } else if (action === 'reject2') {
      update = { status: 'rejected', rejected2_at: now, reject2_reason: reason || '' };
    } else if (action === 'cancel') {
      update = { status: 'cancelled', cancelled_at: now, cancel_reason: reason || '' };
    } else {
      return res.status(400).json({ error: 'Action tidak dikenal' });
    }

    // Kembalikan saldo jika approved → cancelled/rejected (Cuti Tahunan)
    if (['cancel', 'reject1', 'reject2'].includes(action) &&
        leave.status === 'approved' &&
        leave.leave_type === 'Cuti Tahunan') {
      // Kembalikan saldo: hitung dari dates
      const days = (leave.dates || []).length;
      const { data: empData } = await supabase
        .from('employees').select('ann_y1,ann_y2,ann_y3').eq('nik', leave.emp_nik).single();
      if (empData) {
        // Kembalikan ke Y1 dulu
        await supabase.from('employees')
          .update({ ann_y1: (empData.ann_y1 || 0) + days })
          .eq('nik', leave.emp_nik);
      }
    }

    const { error } = await supabase.from('leaves').update(update).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  }

  // ── DELETE ───────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID wajib diisi' });
    const { error } = await supabase.from('leaves').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
