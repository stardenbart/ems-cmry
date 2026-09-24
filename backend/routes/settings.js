const router = require('express').Router();
const { DataGateway, DeviceType, Group, User, EnergyConversion, SmtpSetting, Unit } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { sendTestEmail } = require('../services/emailService');
const { requestReload, probeRegister } = require('../services/modbusReader');
const { invalidateUnits } = require('../services/aggregation');
const audit = require('../services/audit');
const template = require('../services/deviceTemplate');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

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
    const before = gw.toJSON();
    await gw.update(req.body);
    requestReload();
    await audit.record(req, {
      action: 'update', entity: 'gateway', entityId: gw.id, before, after: gw.toJSON(),
    });
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
    const before = { name: dt.name, params: dt.params };
    await dt.update(req.body);
    requestReload();
    await audit.record(req, {
      action: 'update', entity: 'device_type', entityId: dt.id,
      before, after: { name: dt.name, params: dt.params },
    });
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
    const before = u.toJSON();
    await u.update(rest);
    invalidateUnits();
    await audit.record(req, {
      action: 'update', entity: 'unit', entityId: u.id, before, after: u.toJSON(),
    });
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

// GET /api/settings/audit?entity=device_type&limit=50
router.get('/audit', authenticate, authorize('admin'), async (req, res) => {
  try {
    const sequelize = require('../config/database');
    const { QueryTypes } = require('sequelize');
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const rows = await sequelize.query(`
      SELECT id, at, username, action, entity, entity_id, before_val, after_val, ip
        FROM audit_log
       ${req.query.entity ? 'WHERE entity = :entity' : ''}
       ORDER BY at DESC LIMIT :limit`, {
      replacements: { entity: req.query.entity, limit }, type: QueryTypes.SELECT,
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/settings/device-types/:id/export — unduh template sebagai JSON
router.get('/device-types/:id/export', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const dt = await DeviceType.findByPk(req.params.id);
    if (!dt) return res.status(404).json({ error: 'Device type tidak ditemukan' });
    const berkas = template.toExport(dt);
    const nama = String(dt.name).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="template-${nama}.json"`);
    res.json(berkas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/settings/device-types/import — impor template
// Body: isi berkas JSON, opsional { overwrite: true } untuk menimpa yang senama.
router.post('/device-types/import', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { overwrite, ...raw } = req.body || {};
    const hasil = template.validateImport(raw);
    if (!hasil.ok) return res.status(400).json({ error: 'Template tidak sah', errors: hasil.errors });

    const ada = await DeviceType.findOne({ where: { name: hasil.value.name } });
    if (ada && !overwrite) {
      return res.status(409).json({
        error: `Device type "${hasil.value.name}" sudah ada`,
        hint: 'kirim ulang dengan overwrite: true untuk menimpa',
      });
    }

    let dt;
    if (ada) {
      const before = { name: ada.name, params: ada.params };
      await ada.update(hasil.value);
      dt = ada;
      await audit.record(req, {
        action: 'update', entity: 'device_type', entityId: dt.id,
        before, after: { name: dt.name, params: dt.params },
      });
    } else {
      dt = await DeviceType.create(hasil.value);
      await audit.record(req, {
        action: 'create', entity: 'device_type', entityId: dt.id,
        after: { name: dt.name, params: dt.params },
      });
    }

    requestReload();
    res.status(ada ? 200 : 201).json({ id: dt.id, name: dt.name, paramCount: hasil.value.params.length });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ==================== SHIFT & KALENDER ====================
// Prasyarat untuk laporan dan baseline yang jujur: membandingkan hari kerja
// dengan hari libur tidak bermakna.

router.get('/shifts', authenticate, async (req, res) => {
  try {
    const rows = await sequelize.query('SELECT * FROM shifts ORDER BY start_time', { type: QueryTypes.SELECT });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/shifts', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.start_time || !b.end_time) {
      return res.status(400).json({ error: 'name, start_time, dan end_time diperlukan' });
    }
    const [row] = await sequelize.query(`
      INSERT INTO shifts (name, start_time, end_time, weekdays, enabled)
      VALUES (:name, :start_time, :end_time, :weekdays, :enabled) RETURNING *`, {
      replacements: {
        name: b.name, start_time: b.start_time, end_time: b.end_time,
        weekdays: Array.isArray(b.weekdays) && b.weekdays.length > 0 ? b.weekdays.map(Number) : null,
        enabled: b.enabled === undefined ? true : !!b.enabled,
      }, type: QueryTypes.SELECT,
    });
    await audit.record(req, { action: 'create', entity: 'shift', entityId: row.id, after: row });
    res.status(201).json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/shifts/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const [before] = await sequelize.query('SELECT * FROM shifts WHERE id = :id',
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
    if (!before) return res.status(404).json({ error: 'Shift tidak ditemukan' });
    const [row] = await sequelize.query(`
      UPDATE shifts SET name = COALESCE(:name, name),
             start_time = COALESCE(:start_time, start_time),
             end_time = COALESCE(:end_time, end_time),
             weekdays = :weekdays,
             enabled = COALESCE(:enabled, enabled), updated_at = now()
       WHERE id = :id RETURNING *`, {
      replacements: {
        id: req.params.id,
        name: req.body.name ?? null,
        start_time: req.body.start_time ?? null,
        end_time: req.body.end_time ?? null,
        weekdays: Array.isArray(req.body.weekdays)
          ? (req.body.weekdays.length > 0 ? req.body.weekdays.map(Number) : null)
          : before.weekdays,
        enabled: req.body.enabled === undefined ? null : !!req.body.enabled,
      }, type: QueryTypes.SELECT,
    });
    await audit.record(req, { action: 'update', entity: 'shift', entityId: row.id, before, after: row });
    res.json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/shifts/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await sequelize.query('DELETE FROM shifts WHERE id = :id', { replacements: { id: req.params.id } });
    await audit.record(req, { action: 'delete', entity: 'shift', entityId: req.params.id });
    res.json({ message: 'Shift dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Penanda hari khusus: libur, shutdown, maintenance, atau hari kerja di tanggal
// yang biasanya libur.
router.get('/calendar', authenticate, async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT * FROM calendar_days
       WHERE (:dari::date IS NULL OR day >= :dari::date)
         AND (:sampai::date IS NULL OR day <= :sampai::date)
       ORDER BY day`, {
      replacements: { dari: req.query.from || null, sampai: req.query.to || null },
      type: QueryTypes.SELECT });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/calendar', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const { day, kind, note } = req.body || {};
    if (!day || !kind) return res.status(400).json({ error: 'day dan kind diperlukan' });
    const [row] = await sequelize.query(`
      INSERT INTO calendar_days (day, kind, note) VALUES (:day, :kind, :note)
      ON CONFLICT (day) DO UPDATE SET kind = EXCLUDED.kind, note = EXCLUDED.note
      RETURNING *`, { replacements: { day, kind, note: note || null }, type: QueryTypes.SELECT });
    await audit.record(req, { action: 'update', entity: 'calendar_day', entityId: row.id, after: row });
    res.json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/calendar/:day', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    await sequelize.query('DELETE FROM calendar_days WHERE day = :day',
      { replacements: { day: req.params.day } });
    await audit.record(req, { action: 'delete', entity: 'calendar_day', entityId: req.params.day });
    res.json({ message: 'Penanda hari dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== PERAN DAN KAPABILITAS ====================
// Katalog kapabilitas ditetapkan aplikasi karena tiap kapabilitas harus punya
// titik penegakan nyata di kode. Yang bebas dirakit dari UI adalah kombinasinya
// menjadi peran.
const caps = require('../services/capabilities');

router.get('/capabilities', authenticate, authorize('admin'), async (req, res) => {
  res.json(caps.KATALOG);
});

router.get('/roles', authenticate, authorize('admin'), async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT r.*, COALESCE(ARRAY_AGG(rc.capability) FILTER (WHERE rc.capability IS NOT NULL), '{}') AS capabilities
        FROM roles r LEFT JOIN role_capabilities rc ON rc.role_id = r.id
       GROUP BY r.id ORDER BY r.name`, { type: QueryTypes.SELECT });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/roles', authenticate, authorize('admin'), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, description, capabilities } = req.body || {};
    if (!name) { await t.rollback(); return res.status(400).json({ error: 'name diperlukan' }); }

    const [row] = await sequelize.query(
      'INSERT INTO roles (name, description) VALUES (:name, :description) RETURNING *',
      { replacements: { name, description: description || null }, type: QueryTypes.SELECT, transaction: t });

    const bersih = caps.saring(capabilities);
    for (const c of bersih) {
      await sequelize.query('INSERT INTO role_capabilities (role_id, capability) VALUES (:id, :c)',
        { replacements: { id: row.id, c }, transaction: t });
    }
    await t.commit();
    await audit.record(req, { action: 'create', entity: 'role', entityId: row.id, after: { ...row, capabilities: bersih } });
    res.status(201).json({ ...row, capabilities: bersih });
  } catch (err) { await t.rollback(); res.status(400).json({ error: err.message }); }
});

router.put('/roles/:id', authenticate, authorize('admin'), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const [before] = await sequelize.query('SELECT * FROM roles WHERE id = :id',
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT, transaction: t });
    if (!before) { await t.rollback(); return res.status(404).json({ error: 'Peran tidak ditemukan' }); }

    await sequelize.query(`
      UPDATE roles SET name = COALESCE(:name, name),
             description = COALESCE(:description, description), updated_at = now()
       WHERE id = :id`, {
      replacements: { id: req.params.id, name: req.body.name ?? null, description: req.body.description ?? null },
      transaction: t });

    let bersih = null;
    if (Array.isArray(req.body.capabilities)) {
      bersih = caps.saring(req.body.capabilities);
      await sequelize.query('DELETE FROM role_capabilities WHERE role_id = :id',
        { replacements: { id: req.params.id }, transaction: t });
      for (const c of bersih) {
        await sequelize.query('INSERT INTO role_capabilities (role_id, capability) VALUES (:id, :c)',
          { replacements: { id: req.params.id, c }, transaction: t });
      }
      // Kewenangan berubah berarti token lama tidak boleh dipakai lagi.
      await sequelize.query(`
        UPDATE users SET token_version = token_version + 1
         WHERE id IN (SELECT user_id FROM user_roles WHERE role_id = :id)`,
        { replacements: { id: req.params.id }, transaction: t });
    }
    await t.commit();
    await audit.record(req, { action: 'update', entity: 'role', entityId: req.params.id, before, after: { capabilities: bersih } });
    res.json({ id: Number(req.params.id), capabilities: bersih });
  } catch (err) { await t.rollback(); res.status(400).json({ error: err.message }); }
});

router.delete('/roles/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [row] = await sequelize.query('SELECT * FROM roles WHERE id = :id',
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
    if (!row) return res.status(404).json({ error: 'Peran tidak ditemukan' });
    if (row.is_system) return res.status(400).json({ error: 'Peran bawaan tidak bisa dihapus' });

    await sequelize.query('DELETE FROM roles WHERE id = :id', { replacements: { id: req.params.id } });
    await audit.record(req, { action: 'delete', entity: 'role', entityId: req.params.id, before: row });
    res.json({ message: 'Peran dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Penugasan peran ke user ─────────────────────────────────────────────────
router.get('/users/:id/roles', authenticate, authorize('admin'), async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT ur.id, ur.role_id, r.name AS role_name, ur.asset_node_id, a.name AS node_name
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        LEFT JOIN asset_nodes a ON a.id = ur.asset_node_id
       WHERE ur.user_id = :id ORDER BY r.name`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users/:id/roles', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { role_id, asset_node_id } = req.body || {};
    if (!role_id) return res.status(400).json({ error: 'role_id diperlukan' });

    const [row] = await sequelize.query(`
      INSERT INTO user_roles (user_id, role_id, asset_node_id)
      VALUES (:user_id, :role_id, :node)
      ON CONFLICT (user_id, role_id, asset_node_id) DO NOTHING RETURNING *`, {
      replacements: { user_id: req.params.id, role_id, node: asset_node_id || null },
      type: QueryTypes.SELECT });

    await sequelize.query('UPDATE users SET token_version = token_version + 1 WHERE id = :id',
      { replacements: { id: req.params.id } });
    await audit.record(req, { action: 'create', entity: 'user_role', entityId: req.params.id, after: { role_id, asset_node_id } });
    res.status(201).json(row || { message: 'Penugasan sudah ada' });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/users/:userId/roles/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Admin terakhir tidak boleh kehilangan perannya, kalau tidak sistem
    // terkunci tanpa siapa pun yang bisa membukanya.
    const [cek] = await sequelize.query(`
      SELECT COUNT(*) AS n FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE r.name = 'admin' AND ur.id <> :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
    const [ini] = await sequelize.query(`
      SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT });

    if (ini && ini.name === 'admin' && Number(cek.n) === 0) {
      return res.status(400).json({ error: 'Ini penugasan admin terakhir, tidak bisa dihapus' });
    }

    await sequelize.query('DELETE FROM user_roles WHERE id = :id', { replacements: { id: req.params.id } });
    await sequelize.query('UPDATE users SET token_version = token_version + 1 WHERE id = :id',
      { replacements: { id: req.params.userId } });
    await audit.record(req, { action: 'delete', entity: 'user_role', entityId: req.params.id });
    res.json({ message: 'Penugasan dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

