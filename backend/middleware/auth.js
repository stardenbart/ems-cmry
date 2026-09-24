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

    // Akun yang masih memakai password bawaan hanya boleh mengakses endpoint
    // auth, sampai passwordnya diganti. Tanpa ini, admin/admin tetap terbuka.
    if (decoded.mcp === true && !req.path.startsWith('/change-password')) {
      return res.status(428).json({
        error: 'Password bawaan harus diganti sebelum memakai sistem',
        must_change_password: true,
      });
    }

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