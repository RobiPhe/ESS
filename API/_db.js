// api/_db.js — Supabase client (dipakai semua route)
// File ini TIDAK jadi endpoint — prefix underscore diabaikan Vercel
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default supabase;

// Helper: kirim JSON response
export function res(response, status, data) {
  return response.status(status).json(data);
}

// Helper: only allow specific HTTP methods
export function allowMethods(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return false;
  }
  return true;
}
