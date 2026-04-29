const router = require('express').Router();
const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../config/database');
const { AlarmLog } = require('../models');
const { authenticate } = require('../middleware/auth');

const MAX_DAYS = 31; // guard against pulling millions of rows

// GET /api/reports/basic?device_id=1&parameter=...&start=...&end=...
router.get('/basic', authenticate, async (req, res) => {
  try {
    const { device_id, parameter, start, end } = req.query;
    if (!device_id || !start || !end) {
      return res.status(400).json({ error: 'device_id, start, dan end diperlukan' });
    }

    // Validate date range
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    if (isNaN(diffDays) || diffDays < 0) {
      return res.status(400).json({ error: 'Tanggal tidak valid' });
    }
    if (diffDays > MAX_DAYS) {
      return res.status(400).json({ error: `Maksimal rentang laporan adalah ${MAX_DAYS} hari` });
    }

    let paramFilter = '';
    const replacements = { device_id, start, end };
    if (parameter) {
      paramFilter = 'AND r.parameter = :parameter';
      replacements.parameter = parameter;
    }

    const data = await sequelize.query(`
      SELECT r.timestamp as date,
             d.name as device,
             r.parameter,
             r.value
      FROM readings r
      JOIN devices d ON r.device_id = d.id
      WHERE r.device_id = :device_id
        AND r.timestamp BETWEEN :start AND :end
        ${paramFilter}
      ORDER BY r.timestamp DESC
      LIMIT 10000
    `, { replacements, type: QueryTypes.SELECT });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/alarm?start=...&end=...
router.get('/alarm', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start dan end diperlukan' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(400).json({ error: 'Tanggal tidak valid' });
    }

    const data = await AlarmLog.findAll({
      where: {
        triggered_at: {
          [Op.between]: [startDate, endDate],
        },
      },
      order: [['triggered_at', 'DESC']],
      limit: 5000,
      raw: true,
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/parameters/:device_id - Daftar parameter tersedia untuk device
router.get('/parameters/:device_id', authenticate, async (req, res) => {
  try {
    const data = await sequelize.query(`
      SELECT DISTINCT parameter FROM readings
      WHERE device_id = :device_id
      ORDER BY parameter
    `, {
      replacements: { device_id: req.params.device_id },
      type: QueryTypes.SELECT,
    });
    res.json(data.map((r) => r.parameter));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;