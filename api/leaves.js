// api/leaves.js
const getSupabase = require('./_db');
const supabase = getSupabase();

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { empNik, all, approverNik } = req.query;
      if (all === '1') {
        const { data, error } = await supabase.from('leaves').select('*').order('applied_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (empNik) {
        const { data, error } = await supabase.from('leaves').select('*').eq('emp_nik', empNik).order('applied_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (approverNik) {
        const { data: supDepts } = await supabase.from('supervisors').select('dept,level').eq('nik', approverNik);
        if (!supDepts || !supDepts.length) return res.status(200).json([]);
        const depts = [...new Set(supDepts.map(s => s.dept))];
        const { data: deptEmps } = await supabase.from('employees').select('nik,dept').in('dept', depts);
        const niks = (deptEmps || []).map(e => e.nik);
        if (!niks.length) return res.status(200).json([]);
        const { data: leaves, error } = await supabase.from('leaves').select('*').in('emp_nik', niks).in('status', ['pending', 'approved1']).order('applied_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json(leaves || []);
      }
      return res.status(400).json({ error: 'Parameter kurang' });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { emp_nik, leave_type, dates, reason, approver1_nik, approver1_name, approver1_pos, approver2_nik, approver2_name, approver2_pos } = body;
      if (!emp_nik || !leave_type || !dates || !dates.length)
        return res.status(400).json({ error: 'Data tidak lengkap' });
      const id = require('crypto').randomUUID();
      const status = approver1_nik ? 'pending' : 'approved';
      const { error } = await supabase.from('leaves').insert({
        id, emp_nik, leave_type, dates, reason, status,
        approver1_nik, approver1_name, approver1_pos,
        approver2_nik: approver2_nik || null, approver2_name: approver2_name || null, approver2_pos: approver2_pos || null
      });
      if (error) throw error;
      return res.status(201).json({ ok: true, id });
    }

    if (req.method === 'PUT') {
      const { id, action, reason } = req.body || {};
      if (!id || !action) return res.status(400).json({ error: 'ID dan action wajib' });
      const now = new Date().toISOString();
      let update = {};
      if (action === 'approve1') update = { status: 'approved1', approved1_at: now };
      else if (action === 'approve2') update = { status: 'approved', approved2_at: now };
      else if (action === 'reject1') update = { status: 'rejected', rejected1_at: now, reject1_reason: reason || '' };
      else if (action === 'reject2') update = { status: 'rejected', rejected2_at: now, reject2_reason: reason || '' };
      else if (action === 'cancel') update = { status: 'cancelled', cancelled_at: now, cancel_reason: reason || '' };
      else return res.status(400).json({ error: 'Action tidak dikenal' });

      // Cek apakah level 2 ada — jika approve1 dan tidak ada level 2, langsung approved
      if (action === 'approve1') {
        const { data: lv } = await supabase.from('leaves').select('approver2_nik').eq('id', id).maybeSingle();
        if (!lv?.approver2_nik) update.status = 'approved';
      }

      const { error } = await supabase.from('leaves').update(update).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID wajib' });
      const { error } = await supabase.from('leaves').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('leaves error:', err);
    return res.status(500).json({ error: err.message });
  }
};
