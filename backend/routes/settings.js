const router = require('express').Router();
const { DataGateway, DeviceType, Group, User, EnergyConversion, SmtpSetting } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { sendTestEmail } = require('../services/emailService');

// ==================== DATA GATEWAY ====================

router.get('/gateways', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const data = await DataGateway.findAll({ order: [['id', 'ASC']] });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/gateways', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, protocol, port_or_ip, baudrate, parity } = req.body;
    if (!name || !port_or_ip) {
      return res.status(400).json({ error: 'name dan port_or_ip diperlukan' });
    }
    const gw = await DataGateway.create({ name, protocol, port_or_ip, baudrate, parity });
    res.status(201).json(gw);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/gateways/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const gw = await DataGateway.findByPk(req.params.id);
    if (!gw) return res.status(404).json({ error: 'Gateway tidak ditemukan' });
    await gw.update(req.body);
    res.json(gw);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/gateways/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const gw = await DataGateway.findByPk(req.params.id);
    if (!gw) return res.status(404).json({ error: 'Gateway tidak ditemukan' });
    await gw.destroy();
    res.json({ message: 'Gateway berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== DEVICE TYPES (DATA MAPPING) ====================

router.get('/device-types', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const data = await DeviceType.findAll({ order: [['id', 'ASC']] });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/device-types', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, category, params } = req.body;
    if (!name) return res.status(400).json({ error: 'name diperlukan' });
    const dt = await DeviceType.create({ name, category, params: params || [] });
    res.status(201).json(dt);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/device-types/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const dt = await DeviceType.findByPk(req.params.id);
    if (!dt) return res.status(404).json({ error: 'Device type tidak ditemukan' });
    await dt.update(req.body);
    res.json(dt);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/device-types/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const dt = await DeviceType.findByPk(req.params.id);
    if (!dt) return res.status(404).json({ error: 'Device type tidak ditemukan' });
    await dt.destroy();
    res.json({ message: 'Device type berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== GROUPS ====================

router.get('/groups', authenticate, async (req, res) => {
  try {
    const data = await Group.findAll({ order: [['id', 'ASC']] });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/groups', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name diperlukan' });
    }
    const group = await Group.create({ name: name.trim() });
    res.status(201).json(group);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/groups/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group tidak ditemukan' });
    await group.update(req.body);
    res.json(group);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/groups/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group tidak ditemukan' });
    await group.destroy();
    res.json({ message: 'Group berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== USERS ====================

router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'username', 'level', 'created_at'],
      order: [['id', 'ASC']],
    });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, username, password, level } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'name, username, dan password diperlukan' });
    }
    const user = await User.create({ name, username, password, level: level || 'viewer' });
    res.status(201).json({ id: user.id, name: user.name, username: user.username, level: user.level });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Username sudah digunakan' });
    }
    res.status(400).json({ error: err.message });
  }
});

router.put('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    const updateData = { name: req.body.name, username: req.body.username, level: req.body.level };
    if (req.body.password) updateData.password = req.body.password;
    await user.update(updateData);
    res.json({ id: user.id, name: user.name, username: user.username, level: user.level });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    await user.destroy();
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== ENERGY CONVERSION ====================

router.get('/energy-conversions', authenticate, async (req, res) => {
  try {
    const data = await EnergyConversion.findAll({ order: [['created_at', 'DESC']] });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/energy-conversions', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const { co2_per_kwh, fuel_per_kwh, cost_per_kwh } = req.body;
    if (co2_per_kwh === undefined || fuel_per_kwh === undefined || cost_per_kwh === undefined) {
      return res.status(400).json({ error: 'co2_per_kwh, fuel_per_kwh, cost_per_kwh diperlukan' });
    }
    const ec = await EnergyConversion.create({
      co2_per_kwh: parseFloat(co2_per_kwh) || 0,
      fuel_per_kwh: parseFloat(fuel_per_kwh) || 0,
      cost_per_kwh: parseFloat(cost_per_kwh) || 0,
    });
    res.status(201).json(ec);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ==================== SMTP ====================

router.get('/smtp', authenticate, authorize('admin'), async (req, res) => {
  try {
    const smtp = await SmtpSetting.findOne({ order: [['id', 'DESC']] });
    if (smtp) {
      res.json({ ...smtp.toJSON(), password: smtp.password ? '******' : '' });
    } else {
      res.json({ host: '', port: 465, username: '', password: '' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/smtp', authenticate, authorize('admin'), async (req, res) => {
  try {
    let smtp = await SmtpSetting.findOne({ order: [['id', 'DESC']] });
    const updateData = { ...req.body };
    if (updateData.password === '******') delete updateData.password;
    if (smtp) {
      await smtp.update(updateData);
    } else {
      smtp = await SmtpSetting.create(updateData);
    }
    res.json({ message: 'SMTP berhasil disimpan' });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/smtp/test', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email penerima diperlukan' });
    await sendTestEmail(email);
    res.json({ message: `Test email berhasil dikirim ke ${email}` });
  } catch (err) {
    res.status(400).json({ error: `Gagal kirim: ${err.message}` });
  }
});

module.exports = router;