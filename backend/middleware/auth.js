const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware: Verifikasi JWT token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token diperlukan' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, username, level }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah expired' });
  }
}

// Middleware: Cek level akses
function authorize(...allowedLevels) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Tidak terautentikasi' });
    }
    if (!allowedLevels.includes(req.user.level)) {
      return res.status(403).json({ error: 'Akses ditolak. Level Anda tidak memiliki izin.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };