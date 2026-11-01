// api/balance.js
const getSupabase = require('./_db');
const supabase = getSupabase();

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET: Ambil status antrean update masal & riwayat rollover ─────────
    if (req.method === 'GET') {
      const currentYear = new Date().getFullYear();
      const targetYear = currentYear + 1;
      const targetDate = `${targetYear}-01-01`;

      const [pendingRes, configRes, calRes] = await Promise.all([
        supabase.from('big_leave_log')
          .select('*')
          .eq('type', 'ann_bulk_pending')
          .eq('log_date', targetDate)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase.from('big_leave_log')
          .select('*')
          .eq('type', 'ann_year_shift')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('work_calendar')
          .select('date')
          .eq('year', targetYear)
          .limit(1)
      ]);

      const pendingRecord = (pendingRes.data && pendingRes.data[0]) || null;
      let pendingInfo = null;
      if (pendingRecord) {
        try {
          pendingInfo = JSON.parse(pendingRecord.note);
        } catch (_) {
          pendingInfo = { note: pendingRecord.note, amount: pendingRecord.amount };
        }
      }

      return res.status(200).json({
        ok: true,
        currentYear,
        targetYear,
        hasCalendar: Boolean(calRes.data && calRes.data.length > 0),
        pending: pendingInfo,
        history: (configRes.data || []).map(r => {
          try { return JSON.parse(r.note); } catch (_) { return { year: r.amount, date: r.log_date }; }
        })
      });
    }

    // ── PUT: Update saldo individual ──────────────────────────────────────
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

    // ── POST: Update masal (Desember) / Eksekusi rollover (1 Jan) ────────
    if (req.method === 'POST') {
      const { action, dept, amount, year } = req.body || {};

      // ── AKSI 1: Rollover otomatis tahun baru (Y3 hangus, Y2->Y3, Y1->Y2, Y1=pending)
      if (action === 'rollover') {
        const now = new Date();
        const currentYear = now.getFullYear();
        const targetDate = `${currentYear}-01-01`;

        // Cek apakah rollover tahun ini sudah dieksekusi di database
        const { data: doneLog } = await supabase.from('big_leave_log')
          .select('id')
          .eq('type', 'ann_year_shift')
          .eq('amount', currentYear)
          .limit(1);

        if (doneLog && doneLog.length > 0) {
          return res.status(200).json({ ok: true, alreadyDone: true, year: currentYear });
        }

        // Ambil pending update masal untuk 1 Januari tahun ini jika ada
        const { data: pLog } = await supabase.from('big_leave_log')
          .select('*')
          .eq('type', 'ann_bulk_pending')
          .eq('log_date', targetDate)
          .order('created_at', { ascending: false })
          .limit(1);

        let bulkPlan = null;
        if (pLog && pLog.length > 0) {
          try {
            bulkPlan = JSON.parse(pLog[0].note);
          } catch (_) {
            bulkPlan = { amount: pLog[0].amount, year: currentYear };
          }
        }

        // Ambil semua karyawan
        const { data: emps, error: empErr } = await supabase
          .from('employees')
          .select('nik, name, dept, status, join_date, ann_y1, ann_y2, ann_y3');
        if (empErr) throw empErr;

        let totalExpiredY3 = 0;
        const updates = (emps || []).map(e => {
          const oldY3 = e.ann_y3 || 0;
          const oldY2 = e.ann_y2 || 0;
          const oldY1 = e.ann_y1 || 0;
          totalExpiredY3 += oldY3;

          // Pergeseran: Y3 hangus, Y2 masuk ke Y3, Y1 masuk ke Y2
          const newY3 = oldY2;
          const newY2 = oldY1;
          let newY1 = 0;

          // Jika ada update masal yang dijadwalkan untuk 1 Januari tahun ini:
          if (bulkPlan && (e.status === 'tetap' || bulkPlan.includeContract)) {
            let add = Number(bulkPlan.amount || 0);
            if (e.join_date) {
              const jd = new Date(e.join_date + 'T12:00:00');
              const eligYear = jd.getFullYear() + 1;
              const eligMonth = jd.getMonth(); // 0 = Jan ... 11 = Des

              if (eligYear > currentYear) {
                // Belum genap 1 tahun di tahun ini (misal masuk 2026, hak baru timbul 2027)
                add = 0;
              } else if (eligYear === currentYear) {
                // Genap 1 tahun di tahun berjalan:
                // Sisa bulan dihitung dari bulan timbul hak cuti (eligMonth) hingga Desember (12 - eligMonth)
                // Jika sisa bulan >= kuota full year, dapat kuota penuh (contoh: masuk April 2026 -> hak timbul April 2027 -> sisa 9 bulan >= 6 hari -> dapat 6 hari)
                // Jika sisa bulan < kuota full year, dapat sisa bulannya (contoh: masuk Okt 2026 -> hak timbul Okt 2027 -> sisa 3 bulan < 6 hari -> dapat 3 hari)
                const sisaBulan = 12 - eligMonth;
                add = Math.min(add, Math.max(0, sisaBulan));
              }
              // Jika eligYear < currentYear -> sudah bekerja lebih dari 1 tahun penuh -> dapat full add
            }
            newY1 = Math.max(0, add);
          }

          return supabase.from('employees').update({
            ann_y3: newY3,
            ann_y2: newY2,
            ann_y1: newY1
          }).eq('nik', e.nik);
        });

        await Promise.all(updates);

        // Tandai rollover tahun ini telah selesai di big_leave_log
        await supabase.from('big_leave_log').insert({
          emp_nik: 'SYS_ANN',
          type: 'ann_year_shift',
          amount: currentYear,
          note: JSON.stringify({
            year: currentYear,
            executedAt: now.toISOString(),
            totalEmployees: emps.length,
            totalExpiredY3,
            bulkApplied: Boolean(bulkPlan),
            bulkAmount: bulkPlan ? bulkPlan.amount : 0
          }),
          log_date: targetDate
        });

        return res.status(200).json({
          ok: true,
          shiftedYear: currentYear,
          totalUpdated: updates.length,
          totalExpiredY3,
          bulkApplied: Boolean(bulkPlan)
        });
      }

      // ── AKSI 2: Update masal cuti tahunan (Dijadwalkan di Desember untuk 1 Jan)
      const targetYear = parseInt(year);
      const days = parseInt(amount);
      if (!days || days < 1) return res.status(400).json({ error: 'Jumlah hari tidak valid (minimal 1 hari)' });
      if (!targetYear) return res.status(400).json({ error: 'Tahun update tidak valid' });

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0 = Jan, 11 = Des

      // Aturan 1: Update masal harus dilakukan di bulan Desember (atau tahun target adalah tahun baru)
      if (currentMonth !== 11) {
        return res.status(400).json({
          error: `Update masal cuti tahunan hanya dapat dilakukan pada bulan Desember setelah kesepakatan kalender kerja & cuti (Bulan saat ini: ${now.toLocaleDateString('id-ID', { month: 'long' })}).`
        });
      }

      // Validasi kalender kerja tahun target sudah diinput
      const { data: calCheck, error: calErr } = await supabase
        .from('work_calendar')
        .select('date')
        .eq('year', targetYear)
        .limit(1);
      if (calErr) throw calErr;
      if (!calCheck || calCheck.length === 0) {
        return res.status(400).json({
          error: `Kalender kerja tahun ${targetYear} belum diinput/disepakati. Silakan input kalender kerja tahun ${targetYear} terlebih dahulu di menu Kalender Kerja.`
        });
      }

      // Simpan jadwal update masal ke big_leave_log untuk dieksekusi 1 Januari
      const targetEffectiveDate = `${targetYear}-01-01`;
      const schedulePayload = {
        amount: days,
        year: targetYear,
        dept: dept || 'ALL',
        scheduledAt: now.toISOString(),
        effectiveDate: targetEffectiveDate
      };

      // Hapus jika sudah pernah ada antrean untuk tanggal efektif yang sama
      await supabase.from('big_leave_log')
        .delete()
        .eq('type', 'ann_bulk_pending')
        .eq('log_date', targetEffectiveDate);

      // Simpan antrean baru
      const { error: insErr } = await supabase.from('big_leave_log').insert({
        emp_nik: 'SYS_ANN',
        type: 'ann_bulk_pending',
        amount: days,
        note: JSON.stringify(schedulePayload),
        log_date: targetEffectiveDate
      });
      if (insErr) throw insErr;

      // Hitung pratinjau jumlah karyawan tetap yang akan mendapatkan kuota
      let q = supabase.from('employees').select('nik').eq('status', 'tetap');
      if (dept && dept !== 'ALL') q = q.eq('dept', dept);
      const { data: countData } = await q;

      return res.status(200).json({
        ok: true,
        scheduled: true,
        targetYear,
        effectiveDate: targetEffectiveDate,
        amount: days,
        previewCount: (countData || []).length,
        message: `Jadwal update masal cuti tahunan tahun ${targetYear} (${days} hari) berhasil disimpan. Kuota Y1 akan otomatis aktif pada tanggal 1 Januari ${targetYear} saat perpindahan saldo tahun baru.`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('balance error:', err);
    return res.status(500).json({ error: err.message });
  }
};
