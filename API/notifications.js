// api/notifications.js
// GET    /api/notifications?nik=xxx     → notif milik user
// POST   /api/notifications              → buat notif baru
// PUT    /api/notifications              → tandai baca { nik } atau { id }
// DELETE /api/notifications?nik=xxx     → hapus semua notif user
import supabase from './_db.js';

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { nik } = req.query;
    if (!nik) return res.status(400).json({ error: 'NIK wajib diisi' });
    const { data, error } = await supabase
      .from('notifications').select('*')
      .eq('target_nik', nik).order('created_at', { ascending: false }).limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { target_nik, title, body, leave_id } = req.body;
    if (!target_nik || !title)
      return res.status(400).json({ error: 'target_nik dan title wajib diisi' });
    const { error } = await supabase.from('notifications').insert({
      target_nik, title, body: body || '', leave_id: leave_id || null
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  if (req.method === 'PUT') {
    const { nik, id } = req.body;
    let q = supabase.from('notifications').update({ is_read: true });
    if (id) q = q.eq('id', id);
    else if (nik) q = q.eq('target_nik', nik);
    else return res.status(400).json({ error: 'nik atau id wajib diisi' });
    const { error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { nik } = req.query;
    if (!nik) return res.status(400).json({ error: 'NIK wajib diisi' });
    const { error } = await supabase.from('notifications').delete().eq('target_nik', nik);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
