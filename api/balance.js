// api/balance.js
const supabase = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'PUT') {
      const { nik, ann_y1, ann_y2, ann_y3, big_leave } = req.body || {};
      if (!nik) return res.status(400).json({ error: 'NIK wajib' });
      const fields = {};
      if (ann_y1 !== undefined) fields.ann_y1 = ann_y1;
      if (ann_y2 !== undefined) fields.ann_y2 = ann_y2;
      if (ann_y3 !== undefined) fields.ann_y3 = ann_y3;
      if (big_leave !== undefined) fields.big_leave = big_leave;
      const { error } = await supabase.from('employees').update(fields).eq('nik', nik);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST') {
      const { dept, amount, year } = req.body || {};
      if (!amount || amount < 1) return res.status(400).json({ error: 'Jumlah hari tidak valid' });
      let q = supabase.from('employees').select('nik, ann_y1, join_date').eq('status', 'tetap');
      if (dept && dept !== 'ALL') q = q.eq('dept', dept);
      const { data: emps, error } = await q;
      if (error) throw error;
      if (!emps || !emps.length) return res.status(404).json({ error: 'Tidak ada karyawan ditemukan' });

      const updates = emps.map(e => {
        let add = Number(amount);
        if (e.join_date) {
          const jd = new Date(e.join_date + 'T12:00:00');
          const elig = new Date(jd.getFullYear() + 1, jd.getMonth() + 1, 1);
          if (elig.getFullYear() > year) return null;
          if (elig.getFullYear() === year) { const ml = 12 - elig.getMonth(); add = Math.round((ml / 12) * add); }
        }
        if (add <= 0) return null;
        return supabase.from('employees').update({ ann_y1: (e.ann_y1 || 0) + add }).eq('nik', e.nik);
      }).filter(Boolean);

      await Promise.all(updates);
      return res.status(200).json({ ok: true, updated: updates.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('balance error:', err);
    return res.status(500).json({ error: err.message });
  }
};
