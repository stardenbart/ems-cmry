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

module.exports = router;