const router = require('express').Router();
const { Alarm, AlarmLog, Device } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/alarms/logs - Daftar alarm yang terpicu (halaman Alarm)
router.get('/logs', authenticate, async (req, res) => {
  try {
    const logs = await AlarmLog.findAll({
      order: [['triggered_at', 'DESC']],
      limit: 200,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/alarms/logs/:id/acknowledge - Acknowledge alarm
router.put('/logs/:id/acknowledge', authenticate, async (req, res) => {
  try {
    const log = await AlarmLog.findByPk(req.params.id);
    if (!log) return res.status(404).json({ error: 'Alarm log tidak ditemukan' });

    if (log.acknowledged_at) {
      return res.status(400).json({ error: 'Alarm sudah di-acknowledge' });
    }

    await log.update({
      acknowledged_at: new Date(),
      acknowledged_by: req.user.name || req.user.username,
    });

    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alarms/config - List konfigurasi alarm (Settings)
router.get('/config', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const alarms = await Alarm.findAll({
      include: [{ model: Device, as: 'device', attributes: ['id', 'name'] }],
      order: [['id', 'ASC']],
    });
    res.json(alarms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alarms/config
router.post('/config', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const alarm = await Alarm.create(req.body);
    res.status(201).json(alarm);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/alarms/config/:id
router.put('/config/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const alarm = await Alarm.findByPk(req.params.id);
    if (!alarm) return res.status(404).json({ error: 'Alarm tidak ditemukan' });
    await alarm.update(req.body);
    res.json(alarm);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/alarms/config/:id
router.delete('/config/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const alarm = await Alarm.findByPk(req.params.id);
    if (!alarm) return res.status(404).json({ error: 'Alarm tidak ditemukan' });
    await alarm.destroy();
    res.json({ message: 'Alarm berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ALARM RULES ====================
// Aturan alarm yang dirakit dari UI: parameter, operator, ambang, durasi tahan,
// tingkat keparahan, jendela aktif, dan penerima.
const sequelizeAR = require('../config/database');
const { QueryTypes: QT } = require('sequelize');
const auditAR = require('../services/audit');
const { OPERATOR } = require('../services/alarmRules');
const { reloadRules } = require('../services/alarmEngine');

router.get('/rules', authenticate, async (req, res) => {
  try {
    const rows = await sequelizeAR.query(`
      SELECT r.*, d.name AS device_name, a.name AS node_name
        FROM alarm_rules r
        LEFT JOIN devices d ON d.id = r.device_id
        LEFT JOIN asset_nodes a ON a.id = r.asset_node_id
       ORDER BY r.id`, { type: QT.SELECT });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/rules', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.parameter) return res.status(400).json({ error: 'name and parameter are required' });
    if (!OPERATOR[b.operator]) return res.status(400).json({ error: 'invalid operator' });
    if (!b.device_id && !b.asset_node_id) {
      return res.status(400).json({ error: 'device_id or asset_node_id is required' });
    }
    if (b.threshold === undefined || b.threshold === null || Number.isNaN(Number(b.threshold))) {
      return res.status(400).json({ error: 'threshold is required' });
    }

    const [row] = await sequelizeAR.query(`
      INSERT INTO alarm_rules (name, device_id, asset_node_id, parameter, operator, threshold,
                               hold_seconds, severity, enabled, active_from, active_to,
                               recipients, email_template)
      VALUES (:name, :device_id, :asset_node_id, :parameter, :operator, :threshold,
              :hold_seconds, :severity, :enabled, :active_from, :active_to,
              :recipients, :email_template) RETURNING *`, {
      replacements: {
        name: b.name, device_id: b.device_id || null, asset_node_id: b.asset_node_id || null,
        parameter: b.parameter, operator: b.operator, threshold: Number(b.threshold),
        hold_seconds: b.hold_seconds === undefined ? 60 : Number(b.hold_seconds),
        severity: b.severity || 'warning',
        enabled: b.enabled === undefined ? true : !!b.enabled,
        active_from: b.active_from || null, active_to: b.active_to || null,
        recipients: b.recipients || null, email_template: b.email_template || 'default',
      }, type: QT.SELECT,
    });
    reloadRules();
    await auditAR.record(req, { action: 'create', entity: 'alarm_rule', entityId: row.id, after: row });
    res.status(201).json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/rules/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const [before] = await sequelizeAR.query('SELECT * FROM alarm_rules WHERE id = :id',
      { replacements: { id: req.params.id }, type: QT.SELECT });
    if (!before) return res.status(404).json({ error: 'Rule not found' });
    if (req.body.operator && !OPERATOR[req.body.operator]) {
      return res.status(400).json({ error: 'invalid operator' });
    }

    const [row] = await sequelizeAR.query(`
      UPDATE alarm_rules SET
        name = COALESCE(:name, name), parameter = COALESCE(:parameter, parameter),
        operator = COALESCE(:operator, operator), threshold = COALESCE(:threshold, threshold),
        hold_seconds = COALESCE(:hold_seconds, hold_seconds),
        severity = COALESCE(:severity, severity), enabled = COALESCE(:enabled, enabled),
        active_from = :active_from, active_to = :active_to,
        recipients = COALESCE(:recipients, recipients),
        email_template = COALESCE(:email_template, email_template),
        updated_at = now()
      WHERE id = :id RETURNING *`, {
      replacements: {
        id: req.params.id,
        name: req.body.name ?? null, parameter: req.body.parameter ?? null,
        operator: req.body.operator ?? null,
        threshold: req.body.threshold === undefined ? null : Number(req.body.threshold),
        hold_seconds: req.body.hold_seconds === undefined ? null : Number(req.body.hold_seconds),
        severity: req.body.severity ?? null,
        enabled: req.body.enabled === undefined ? null : !!req.body.enabled,
        active_from: req.body.active_from ?? before.active_from,
        active_to: req.body.active_to ?? before.active_to,
        recipients: req.body.recipients ?? null,
        email_template: req.body.email_template ?? null,
      }, type: QT.SELECT,
    });
    reloadRules();
    await auditAR.record(req, { action: 'update', entity: 'alarm_rule', entityId: row.id, before, after: row });
    res.json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/rules/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await sequelizeAR.query('DELETE FROM alarm_rules WHERE id = :id', { replacements: { id: req.params.id } });
    reloadRules();
    await auditAR.record(req, { action: 'delete', entity: 'alarm_rule', entityId: req.params.id });
    res.json({ message: 'Rule deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Riwayat penyalaan
router.get('/events', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const rows = await sequelizeAR.query(`
      SELECT e.*, r.name AS rule_name, d.name AS device_name
        FROM alarm_events e
        LEFT JOIN alarm_rules r ON r.id = e.rule_id
        LEFT JOIN devices d ON d.id = e.device_id
       ${req.query.active === '1' ? 'WHERE e.cleared_at IS NULL' : ''}
       ORDER BY e.started_at DESC LIMIT :limit`, { replacements: { limit }, type: QT.SELECT });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/events/:id/ack', authenticate, async (req, res) => {
  try {
    const [row] = await sequelizeAR.query(`
      UPDATE alarm_events SET acknowledged_at = now(), acknowledged_by = :who
       WHERE id = :id AND acknowledged_at IS NULL RETURNING *`, {
      replacements: { id: req.params.id, who: req.user.username }, type: QT.SELECT });
    if (!row) return res.status(404).json({ error: 'Event not found or already acknowledged' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== EMAIL TEMPLATES ====================
router.get('/templates', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    res.json(await sequelizeAR.query('SELECT * FROM email_templates ORDER BY name', { type: QT.SELECT }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/templates/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [before] = await sequelizeAR.query('SELECT * FROM email_templates WHERE id = :id',
      { replacements: { id: req.params.id }, type: QT.SELECT });
    if (!before) return res.status(404).json({ error: 'Template not found' });
    const [row] = await sequelizeAR.query(`
      UPDATE email_templates SET subject = COALESCE(:subject, subject),
             body = COALESCE(:body, body), updated_at = now()
       WHERE id = :id RETURNING *`, {
      replacements: { id: req.params.id, subject: req.body.subject ?? null, body: req.body.body ?? null },
      type: QT.SELECT });
    await auditAR.record(req, { action: 'update', entity: 'email_template', entityId: row.id, before, after: row });
    res.json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
