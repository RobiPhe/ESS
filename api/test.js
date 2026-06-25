module.exports = function handler(req, res) {
  res.status(200).json({ 
    ok: true, 
    message: 'API works!',
    method: req.method,
    env_url: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
    env_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'
  });
};
