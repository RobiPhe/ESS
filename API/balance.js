// api/balance.js
// PUT /api/balance        → update saldo satu karyawan
// POST /api/balance/bulk  → update masal saldo Y1 semua karyawan
import supabase from './_db.js';

export default async function handler(req, res) {

  // ── PUT: update saldo satu karyawan ─────────────────────────
  if (req.method === 'PUT') {
    const { nik, ann_y1, ann_y2, ann_y3, big_leave } = req.body;
    if (!nik) return res.status(400).json({ error: 'NIK wajib diisi' });

    const fields = {};
    if (ann_y1 !== undefined) fields.ann_y1 = ann_y1;
    if (ann_y2 !== undefined) fields.ann_y2 = ann_y2;
    if (ann_y3 !== undefined) fields.ann_y3 = ann_y3;
    if (big_leave !== undefined) fields.big_leave = big_leave;

    const { error } = await supabase.from('employees').update(fields).eq('nik', nik);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // ── POST: update masal Y1 (tambah ke saldo existing) ────────
  if (req.method === 'POST') {
    const { dept, amount, year } = req.body;
    if (!amount || amount < 1)
      return res.status(400).json({ error: 'Jumlah hari tidak valid' });

    // Ambil karyawan tetap (hanya tetap yang dapat cuti tahunan)
    let query = supabase.from('employees').select('nik, ann_y1').eq('status', 'tetap');
    if (dept && dept !== 'ALL') query = query.eq('dept', dept);

    const { data: emps, error: fetchErr } = await query;
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!emps || !emps.length)
      return res.status(404).json({ error: 'Tidak ada karyawan ditemukan' });

    // Update satu per satu — tambahkan ke Y1 existing
    const updates = emps.map(e =>
      supabase.from('employees')
        .update({ ann_y1: (e.ann_y1 || 0) + Number(amount) })
        .eq('nik', e.nik)
    );
    const results = await Promise.all(updates);
    const failed = results.filter(r => r.error);
    if (failed.length) return res.status(500).json({ error: 'Sebagian update gagal' });

    return res.status(200).json({ ok: true, updated: emps.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
