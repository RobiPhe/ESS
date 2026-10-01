// api/leaves.js — Self-contained, no _db.js dependency
const { createClient } = require('@supabase/supabase-js');

function getDB() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Pesan jelas (JSON) kalau env belum di-set, bukan crash polos dari Vercel
  if (!url) throw new Error('Env SUPABASE_URL belum di-set di Vercel');
  if (!key) throw new Error('Env SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel');
  return createClient(url, key);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = getDB();   // di dalam try → error env tetap dibalas sebagai JSON

    // ── GET ──────────────────────────────────────────────
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
        // L1 lihat 'pending', L2 lihat 'approved1'
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

    // ── POST: Ajukan cuti baru ────────────────────────────
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
        approver2_nik:  approver2_nik  || null,
        approver2_name: approver2_name || null,
        approver2_pos:  approver2_pos  || null,
        approve1_note:  '',
        approve2_note:  '',
      });
      if (error) throw error;
      return res.status(201).json({ ok: true, id });
    }

    // ── PUT: Approve / Reject / Cancel ───────────────────
    if (req.method === 'PUT') {
      const { id, action, reason, used_y1, used_y2, used_y3 } = req.body || {};
      if (!id || !action)
        return res.status(400).json({ error: 'ID dan action wajib' });

      const now  = new Date().toISOString();
      const note = (reason || '').trim();
      let update = {};

      const isApprovalAction = ['approve1', 'approve2', 'reject1', 'reject2'].includes(action);

      // Pesan/komentar WAJIB untuk approve & tolak (level 1 dan 2)
      if (isApprovalAction && !note)
        return res.status(400).json({ error: 'Pesan/komentar wajib diisi' });

      // Ambil kondisi pengajuan saat ini (validasi tahap approval)
      const { data: curArr, error: curErr } = await supabase
        .from('leaves')
        .select('status,approver2_nik')
        .eq('id', id)
        .limit(1);
      if (curErr) throw curErr;
      if (!curArr || !curArr.length)
        return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
      const cur = curArr[0];

      // Level 1 hanya boleh memproses yang masih 'pending',
      // Level 2 hanya boleh memproses yang sudah 'approved1'
      if ((action === 'approve1' || action === 'reject1') && cur.status !== 'pending')
        return res.status(409).json({ error: 'Pengajuan sudah diproses (status: ' + cur.status + ')' });
      if ((action === 'approve2' || action === 'reject2') && cur.status !== 'approved1')
        return res.status(409).json({ error: 'Pengajuan belum disetujui level 1 atau sudah diproses (status: ' + cur.status + ')' });

      if (action === 'approve1') {
        // Ada approver level 2? → approved1 (tunggu L2), kalau tidak → langsung approved
        const hasL2 = !!cur.approver2_nik;
        update = {
          status:        hasL2 ? 'approved1' : 'approved',
          approved1_at:  now,
          approve1_note: note,
        };
      } else if (action === 'approve2') {
        update = {
          status:        'approved',
          approved2_at:  now,
          approve2_note: note,
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

      // Rincian pemotongan saldo cuti tahunan per bucket (hanya saat approval final)
      // NULL di DB = data lama/tidak diketahui
      const toInt = v => (Number.isInteger(v) && v >= 0) ? v : null;
      const u1 = toInt(used_y1), u2 = toInt(used_y2), u3 = toInt(used_y3);
      const hasUsed = update.status === 'approved' && u1 !== null && u2 !== null && u3 !== null;
      const usedFields = hasUsed ? { used_y1: u1, used_y2: u2, used_y3: u3 } : {};

      let { error } = await supabase
        .from('leaves').update({ ...update, ...usedFields }).eq('id', id);
      // Jaga-jaga kalau kolom used_y* belum dibuat di DB: jangan blokir approval
      if (error && hasUsed && /used_y/i.test(error.message || '')) {
        console.error('Kolom used_y* belum ada, jalankan SQL ALTER TABLE. Approval tetap disimpan tanpa rincian.');
        ({ error } = await supabase.from('leaves').update(update).eq('id', id));
      }
      if (error) throw error;
      // Kembalikan status final agar frontend konsisten dengan DB
      return res.status(200).json({ ok: true, status: update.status });
    }

    // ── DELETE ────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID wajib' });
      const { error } = await supabase
        .from('leaves').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('leaves error:', err.message);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
// api/leaves.js — Self-contained, no _db.js dependency
const { createClient } = require('@supabase/supabase-js');

function getDB() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getDB();

  try {
    // ── GET ──────────────────────────────────────────────
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
        // L1 lihat 'pending', L2 lihat 'approved1'
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

    // ── POST: Ajukan cuti baru ────────────────────────────
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
        approver2_nik:  approver2_nik  || null,
        approver2_name: approver2_name || null,
        approver2_pos:  approver2_pos  || null,
        approve1_note:  '',
        approve2_note:  '',
      });
      if (error) throw error;
      return res.status(201).json({ ok: true, id });
    }

    // ── PUT: Approve / Reject / Cancel ───────────────────
    if (req.method === 'PUT') {
      const { id, action, reason, used_y1, used_y2, used_y3 } = req.body || {};
      if (!id || !action)
        return res.status(400).json({ error: 'ID dan action wajib' });

      const now  = new Date().toISOString();
      const note = (reason || '').trim();
      let update = {};

      const isApprovalAction = ['approve1', 'approve2', 'reject1', 'reject2'].includes(action);

      // Pesan/komentar WAJIB untuk approve & tolak (level 1 dan 2)
      if (isApprovalAction && !note)
        return res.status(400).json({ error: 'Pesan/komentar wajib diisi' });

      // Ambil kondisi pengajuan saat ini (validasi tahap approval)
      const { data: curArr, error: curErr } = await supabase
        .from('leaves')
        .select('status,approver2_nik')
        .eq('id', id)
        .limit(1);
      if (curErr) throw curErr;
      if (!curArr || !curArr.length)
        return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
      const cur = curArr[0];

      // Level 1 hanya boleh memproses yang masih 'pending',
      // Level 2 hanya boleh memproses yang sudah 'approved1'
      if ((action === 'approve1' || action === 'reject1') && cur.status !== 'pending')
        return res.status(409).json({ error: 'Pengajuan sudah diproses (status: ' + cur.status + ')' });
      if ((action === 'approve2' || action === 'reject2') && cur.status !== 'approved1')
        return res.status(409).json({ error: 'Pengajuan belum disetujui level 1 atau sudah diproses (status: ' + cur.status + ')' });

      if (action === 'approve1') {
        // Ada approver level 2? → approved1 (tunggu L2), kalau tidak → langsung approved
        const hasL2 = !!cur.approver2_nik;
        update = {
          status:        hasL2 ? 'approved1' : 'approved',
          approved1_at:  now,
          approve1_note: note,
        };
      } else if (action === 'approve2') {
        update = {
          status:        'approved',
          approved2_at:  now,
          approve2_note: note,
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

      // Rincian pemotongan saldo cuti tahunan per bucket (hanya saat approval final)
      // NULL di DB = data lama/tidak diketahui
      const toInt = v => (Number.isInteger(v) && v >= 0) ? v : null;
      const u1 = toInt(used_y1), u2 = toInt(used_y2), u3 = toInt(used_y3);
      const hasUsed = update.status === 'approved' && u1 !== null && u2 !== null && u3 !== null;
      const usedFields = hasUsed ? { used_y1: u1, used_y2: u2, used_y3: u3 } : {};

      let { error } = await supabase
        .from('leaves').update({ ...update, ...usedFields }).eq('id', id);
      // Jaga-jaga kalau kolom used_y* belum dibuat di DB: jangan blokir approval
      if (error && hasUsed && /used_y/i.test(error.message || '')) {
        console.error('Kolom used_y* belum ada, jalankan SQL ALTER TABLE. Approval tetap disimpan tanpa rincian.');
        ({ error } = await supabase.from('leaves').update(update).eq('id', id));
      }
      if (error) throw error;
      // Kembalikan status final agar frontend konsisten dengan DB
      return res.status(200).json({ ok: true, status: update.status });
    }

    // ── DELETE ────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID wajib' });
      const { error } = await supabase
        .from('leaves').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('leaves error:', err.message);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
// api/leaves.js — Self-contained, no _db.js dependency
const { createClient } = require('@supabase/supabase-js');

function getDB() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getDB();

  try {
    // ── GET ──────────────────────────────────────────────
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
        // L1 lihat 'pending', L2 lihat 'approved1'
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

    // ── POST: Ajukan cuti baru ────────────────────────────
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
        approver2_nik:  approver2_nik  || null,
        approver2_name: approver2_name || null,
        approver2_pos:  approver2_pos  || null,
        approve1_note:  '',
        approve2_note:  '',
      });
      if (error) throw error;
      return res.status(201).json({ ok: true, id });
    }

    // ── PUT: Approve / Reject / Cancel ───────────────────
    if (req.method === 'PUT') {
      const { id, action, reason } = req.body || {};
      if (!id || !action)
        return res.status(400).json({ error: 'ID dan action wajib' });

      const now  = new Date().toISOString();
      const note = (reason || '').trim();
      let update = {};

      const isApprovalAction = ['approve1', 'approve2', 'reject1', 'reject2'].includes(action);

      // Pesan/komentar WAJIB untuk approve & tolak (level 1 dan 2)
      if (isApprovalAction && !note)
        return res.status(400).json({ error: 'Pesan/komentar wajib diisi' });

      // Ambil kondisi pengajuan saat ini (validasi tahap approval)
      const { data: curArr, error: curErr } = await supabase
        .from('leaves')
        .select('status,approver2_nik')
        .eq('id', id)
        .limit(1);
      if (curErr) throw curErr;
      if (!curArr || !curArr.length)
        return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
      const cur = curArr[0];

      // Level 1 hanya boleh memproses yang masih 'pending',
      // Level 2 hanya boleh memproses yang sudah 'approved1'
      if ((action === 'approve1' || action === 'reject1') && cur.status !== 'pending')
        return res.status(409).json({ error: 'Pengajuan sudah diproses (status: ' + cur.status + ')' });
      if ((action === 'approve2' || action === 'reject2') && cur.status !== 'approved1')
        return res.status(409).json({ error: 'Pengajuan belum disetujui level 1 atau sudah diproses (status: ' + cur.status + ')' });

      if (action === 'approve1') {
        // Ada approver level 2? → approved1 (tunggu L2), kalau tidak → langsung approved
        const hasL2 = !!cur.approver2_nik;
        update = {
          status:        hasL2 ? 'approved1' : 'approved',
          approved1_at:  now,
          approve1_note: note,
        };
      } else if (action === 'approve2') {
        update = {
          status:        'approved',
          approved2_at:  now,
          approve2_note: note,
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
        .from('leaves').update(update).eq('id', id);
      if (error) throw error;
      // Kembalikan status final agar frontend konsisten dengan DB
      return res.status(200).json({ ok: true, status: update.status });
    }

    // ── DELETE ────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID wajib' });
      const { error } = await supabase
        .from('leaves').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('leaves error:', err.message);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
