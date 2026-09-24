const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
require('dotenv').config();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }

    const isValid = await user.validatePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }

    res.json(sesi(user));
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Token + profil. Dipakai login dan ganti password: setelah password diganti,
// token lama masih membawa mcp:true dan akan terus ditolak 428, jadi user
// langsung diberi token baru.
function sesi(user) {
  const token = jwt.sign(
    { id: user.id, username: user.username, level: user.level, name: user.name,
      mcp: user.must_change_password === true },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      level: user.level,
      must_change_password: user.must_change_password === true,
    },
  };
}

// GET /api/auth/me - Verifikasi token & ambil data user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'username', 'level', 'must_change_password'],
    });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'The new password must be at least 8 characters' });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'The new password must differ from the current one' });
    }

    if (newPassword.toLowerCase() === String(req.user.username).toLowerCase()) {
      return res.status(400).json({ error: 'The new password must not be the same as the username' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 400, bukan 401: interceptor frontend membaca 401 sebagai sesi kedaluwarsa
    // dan akan melempar user ke halaman login hanya karena salah ketik.
    const isValid = await user.validatePassword(currentPassword);
    if (!isValid) {
      return res.status(400).json({ error: 'The current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    if (user.must_change_password) await user.update({ must_change_password: false });
    res.json({ message: 'Password changed', ...sesi(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;