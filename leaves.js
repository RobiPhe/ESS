// api/leaves.js
const supabase = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET ──────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { empNik, all, approverNik } = req.query;

      if (all === '1') {
        const { data, error } = await supabase
          .from('leaves').select('*')
          .order('applied_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data || []);
      }

      if (empNik) {
        const { data, error } = await supabase
          .from('leaves').select('*')
          .eq('emp_nik', empNik)
          .order('applied_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data || []);
      }

      if (approverNik) {
        const { data: supDepts } = await supabase
          .from('supervisors').select('dept,level').eq('nik', approverNik);
        if (!supDepts || !supDepts.length) return res.status(200).json([]);
        const depts = [...new Set(supDepts.map(s => s.dept))];
        const { data: deptEmps } = await supabase
          .from('employees').select('nik,dept').in('dept', depts);
        const niks = (deptEmps || []).map(e => e.nik);
        if (!niks.length) return res.status(200).json([]);
        const { data: leaves, error } = await supabase
          .from('leaves').select('*')
          .in('emp_nik', niks)
          .in('status', ['pending', 'approved1'])
          .order('applied_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json(leaves || []);
      }

      return res.status(400).json({ error: 'Parameter kurang' });
    }

    // ── POST: Ajukan cuti baru ────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body || {};
      const {
        emp_nik, leave_type, dates, reason,
        approver1_nik, approver1_name, approver1_pos,
        approver2_nik, approver2_name, approver2_pos
      } = body;

      if (!emp_nik || !leave_type || !dates || !dates.length)
        return res.status(400).json({ error: 'Data tidak lengkap' });

      const id = require('crypto').randomUUID();
      const status = approver1_nik ? 'pending' : 'approved';

      const { error } = await supabase.from('leaves').insert({
        id, emp_nik, leave_type, dates, reason, status,
        approver1_nik,
        approver1_name,
        approver1_pos,
        approver2_nik:   approver2_nik   || null,
        approver2_name:  approver2_name  || null,
        approver2_pos:   approver2_pos   || null,
        approve1_note:   '',
        approve2_note:   '',
      });
      if (error) throw error;
      return res.status(201).json({ ok: true, id });
    }

    // ── PUT: Approve / Reject / Cancel ────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, action, reason } = req.body || {};
      if (!id || !action)
        return res.status(400).json({ error: 'ID dan action wajib' });

      const now = new Date().toISOString();
      const note = reason || '';

      // Ambil data leave untuk cek approver2
      const { data: leaveArr, error: fetchErr } = await supabase
        .from('leaves')
        .select('approver2_nik')
        .eq('id', id)
        .limit(1);
      if (fetchErr) throw fetchErr;
      const lv = leaveArr?.[0] || {};

      let update = {};

      if (action === 'approve1') {
        const hasL2 = !!lv.approver2_nik;
        update = {
          status:        hasL2 ? 'approved1' : 'approved',
          approved1_at:  now,
          approve1_note: note || 'Disetujui',  // default 'Disetujui' jika kosong
        };
      } else if (action === 'approve2') {
        update = {
          status:        'approved',
          approved2_at:  now,
          approve2_note: note || 'Disetujui',  // default 'Disetujui' jika kosong
        };
      } else if (action === 'reject1') {
        update = {
          status:         'rejected',
          rejected1_at:   now,
          reject1_reason: note,
        };
      } else if (action === 'reject2') {
        update = {
          status:         'rejected',
          rejected2_at:   now,
          reject2_reason: note,
        };
      } else if (action === 'cancel') {
        update = {
          status:        'cancelled',
          cancelled_at:  now,
          cancel_reason: note,
        };
      } else {
        return res.status(400).json({ error: 'Action tidak dikenal: ' + action });
      }

      const { error } = await supabase
        .from('leaves')
        .update(update)
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID wajib' });
      const { error } = await supabase.from('leaves').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('leaves error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
