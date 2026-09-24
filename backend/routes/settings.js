const router = require('express').Router();
const { DataGateway, DeviceType, Group, User, EnergyConversion, SmtpSetting, Unit } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { sendTestEmail } = require('../services/emailService');
const { requestReload, probeRegister } = require('../services/modbusReader');
const { invalidateUnits } = require('../services/aggregation');

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
    requestReload();
    res.status(201).json(gw);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/gateways/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const gw = await DataGateway.findByPk(req.params.id);
    if (!gw) return res.status(404).json({ error: 'Gateway tidak ditemukan' });
    await gw.update(req.body);
    requestReload();
    res.json(gw);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/gateways/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const gw = await DataGateway.findByPk(req.params.id);
    if (!gw) return res.status(404).json({ error: 'Gateway tidak ditemukan' });
    await gw.destroy();
    requestReload();
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
    requestReload();
    res.status(201).json(dt);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/device-types/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const dt = await DeviceType.findByPk(req.params.id);
    if (!dt) return res.status(404).json({ error: 'Device type tidak ditemukan' });
    await dt.update(req.body);
    requestReload();
    res.json(dt);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/device-types/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const dt = await DeviceType.findByPk(req.params.id);
    if (!dt) return res.status(404).json({ error: 'Device type tidak ditemukan' });
    await dt.destroy();
    requestReload();
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

// ==================== UNITS ====================
// Satuan bisa disunting dari UI. Perubahan langsung dipakai lapisan konversi,
// dan karena nilai disimpan mentah, membetulkan faktor yang salah otomatis
// membetulkan seluruh riwayat tanpa UPDATE massal.

router.get('/units', authenticate, async (req, res) => {
  try {
    const where = req.query.quantity ? { quantity: req.query.quantity } : undefined;
    const data = await Unit.findAll({ where, order: [['quantity', 'ASC'], ['factor', 'ASC']] });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/units', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const { symbol, name, quantity, base_symbol, factor, offset_value } = req.body;
    if (!symbol || !name || !quantity || !base_symbol) {
      return res.status(400).json({ error: 'symbol, name, quantity, dan base_symbol diperlukan' });
    }
    const u = await Unit.create({
      symbol, name, quantity, base_symbol,
      factor: factor === undefined ? 1 : factor,
      offset_value: offset_value === undefined ? 0 : offset_value,
      is_system: false,
    });
    invalidateUnits();
    res.status(201).json(u);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/units/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const u = await Unit.findByPk(req.params.id);
    if (!u) return res.status(404).json({ error: 'Satuan tidak ditemukan' });
    const { is_system, ...rest } = req.body; // is_system tidak bisa diubah lewat API
    await u.update(rest);
    invalidateUnits();
    res.json(u);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/units/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const u = await Unit.findByPk(req.params.id);
    if (!u) return res.status(404).json({ error: 'Satuan tidak ditemukan' });
    if (u.is_system) {
      return res.status(400).json({ error: 'Satuan bawaan tidak bisa dihapus, dipakai sebagai dasar konversi' });
    }
    await u.destroy();
    invalidateUnits();
    res.json({ message: 'Satuan berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/settings/probe-register
// Backend Register Explorer. Body: { gatewayId, slaveId, address, length }
router.post('/probe-register', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const gatewayId = parseInt(req.body.gatewayId);
    const slaveId = parseInt(req.body.slaveId);
    const address = parseInt(req.body.address);
    const length = parseInt(req.body.length) || 2;

    if ([gatewayId, slaveId, address].some(Number.isNaN)) {
      return res.status(400).json({ error: 'gatewayId, slaveId, dan address diperlukan' });
    }
    if (length < 1 || length > 125) {
      return res.status(400).json({ error: 'length harus antara 1 dan 125' });
    }

    const result = await probeRegister({ gatewayId, slaveId, address, length });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;