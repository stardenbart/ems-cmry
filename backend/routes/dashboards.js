const router = require('express').Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getLatestData } = require('../websocket/wsServer');
const EnergyConversion = require('../models/EnergyConversion');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: cek apakah 'Energy Active' punya data di DB untuk device ini
// Kalau tidak ada, fallback pakai estimasi dari 'Active Power Total'
// ─────────────────────────────────────────────────────────────────────────────
async function hasEnergyActiveData(device_id) {
  const result = await sequelize.query(`
    SELECT 1 FROM readings
    WHERE device_id = :device_id AND parameter = 'Energy Active'
    LIMIT 1
  `, { replacements: { device_id }, type: QueryTypes.SELECT });
  return result.length > 0;
}

// GET /api/dashboards/realtime/:deviceId
router.get('/realtime/:deviceId', authenticate, async (req, res) => {
  const latestData = getLatestData();
  const data = latestData[req.params.deviceId] || {};
  res.json(data);
});

// GET /api/dashboards/realtime-all
router.get('/realtime-all', authenticate, async (req, res) => {
  res.json(getLatestData());
});

// GET /api/dashboards/energy-conversion
router.get('/energy-conversion', authenticate, async (req, res) => {
  try {
    const latest = await EnergyConversion.findOne({ order: [['created_at', 'DESC']] });
    if (!latest) {
      return res.json({ co2_per_kwh: 0, fuel_per_kwh: 0, cost_per_kwh: 0 });
    }
    res.json({
      co2_per_kwh: latest.co2_per_kwh,
      fuel_per_kwh: latest.fuel_per_kwh,
      cost_per_kwh: latest.cost_per_kwh,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboards/energy-today?device_id=1
//
// Mengembalikan:
//   { base: <nilai Energy Active pertama hari ini>, source: 'energy_active' }
//   ATAU
//   { base: null, source: 'none' }  ← kalau belum ada data sama sekali
//
// Frontend pakai ini untuk hitung: energyToday = energyNow - base
// ─────────────────────────────────────────────────────────────────────────────
router.get('/energy-today', authenticate, async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ error: 'device_id diperlukan' });

    // Coba Energy Active dulu
    const energyResult = await sequelize.query(`
      SELECT value FROM readings
      WHERE device_id = :device_id
        AND parameter = 'Energy Active'
        AND timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'
      ORDER BY timestamp ASC
      LIMIT 1
    `, { replacements: { device_id }, type: QueryTypes.SELECT });

    if (energyResult.length > 0) {
      return res.json({
        base: parseFloat(energyResult[0].value),
        source: 'energy_active',
      });
    }

    // Fallback: estimasi dari Active Power Total yang sudah di DB hari ini
    // SUM(kW) × 0.25 jam (interval 15 menit per reading)
    const powerResult = await sequelize.query(`
      SELECT ROUND(CAST(SUM(value) * 0.25 AS numeric), 3) as estimated_kwh
      FROM readings
      WHERE device_id = :device_id
        AND parameter = 'Active Power Total'
        AND timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'
    `, { replacements: { device_id }, type: QueryTypes.SELECT });

    const estimated = powerResult[0]?.estimated_kwh;
    if (estimated !== null && estimated !== undefined) {
      return res.json({
        base: parseFloat(estimated),
        source: 'active_power_estimated',
      });
    }

    res.json({ base: null, source: 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboards/energy?device_id=1&range=thisMonth
//
// Kalau 'Energy Active' ada di readings → pakai MAX-MIN per periode (akurat)
// Kalau tidak ada → estimasi dari 'Active Power Total' × interval (15 menit = 0.25 jam)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/energy', authenticate, async (req, res) => {
  try {
    const { device_id, range } = req.query;
    if (!device_id) return res.status(400).json({ error: 'device_id diperlukan' });

    let truncate, filter;
    switch (range) {
      case 'today':
        truncate = 'hour';
        filter = "timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'";
        break;
      case 'thisWeek':
        truncate = 'day';
        filter = "timestamp >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      case 'thisMonth':
        truncate = 'day';
        filter = "timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      case 'thisYear':
        truncate = 'month';
        filter = "timestamp >= date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      default:
        truncate = 'hour';
        filter = "timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'";
    }

    const useEnergyActive = await hasEnergyActiveData(device_id);

    let data;
    if (useEnergyActive) {
      // Cara akurat: pakai nilai kumulatif meter (MAX - MIN per periode)
      data = await sequelize.query(`
        SELECT date_trunc('${truncate}', timestamp AT TIME ZONE 'Asia/Jakarta') as period,
               GREATEST(0, MAX(value) - MIN(value)) as total
        FROM readings
        WHERE device_id = :device_id
          AND parameter = 'Energy Active'
          AND ${filter}
        GROUP BY period ORDER BY period
      `, { replacements: { device_id }, type: QueryTypes.SELECT });
    } else {
      // Fallback: estimasi dari Active Power Total
      // Setiap reading mewakili 15 menit = 0.25 jam → kWh = kW × 0.25
      data = await sequelize.query(`
        SELECT date_trunc('${truncate}', timestamp AT TIME ZONE 'Asia/Jakarta') as period,
               ROUND(CAST(SUM(value) * 0.25 AS numeric), 2) as total
        FROM readings
        WHERE device_id = :device_id
          AND parameter = 'Active Power Total'
          AND ${filter}
        GROUP BY period ORDER BY period
      `, { replacements: { device_id }, type: QueryTypes.SELECT });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboards/comparison?device_id=1&range=todayVsYesterday
// ─────────────────────────────────────────────────────────────────────────────
router.get('/comparison', authenticate, async (req, res) => {
  try {
    const { device_id, range } = req.query;
    if (!device_id) return res.status(400).json({ error: 'device_id diperlukan' });

    const useEnergyActive = await hasEnergyActiveData(device_id);
    // Pilih parameter dan formula sesuai ketersediaan data
    const param   = useEnergyActive ? 'Energy Active' : 'Active Power Total';
    const formula = useEnergyActive
      ? 'GREATEST(0, MAX(value) - MIN(value))'
      : 'ROUND(CAST(SUM(value) * 0.25 AS numeric), 2)';

    let currentFilter, previousFilter, truncate;

    switch (range) {
      case 'todayVsYesterday':
        truncate = 'hour';
        currentFilter  = "timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'";
        previousFilter = "timestamp >= (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta') - INTERVAL '1 day' AND timestamp < CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'";
        break;
      case 'thisWeekVsLastWeek':
        truncate = 'day';
        currentFilter  = "timestamp >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        previousFilter = "timestamp >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta') - INTERVAL '7 days' AND timestamp < date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      case 'thisMonthVsLastMonth':
        truncate = 'day';
        currentFilter  = "timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        previousFilter = "timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta') - INTERVAL '1 month' AND timestamp < date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      case 'thisYearVsLastYear':
        truncate = 'month';
        currentFilter  = "timestamp >= date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        previousFilter = "timestamp >= date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta') - INTERVAL '1 year' AND timestamp < date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      default:
        return res.status(400).json({ error: 'Range tidak valid' });
    }

    const buildQuery = (filter) => `
      SELECT date_trunc('${truncate}', timestamp AT TIME ZONE 'Asia/Jakarta') as period,
             ${formula} as total
      FROM readings
      WHERE device_id = :device_id AND parameter = '${param}'
        AND ${filter}
      GROUP BY period ORDER BY period
    `;

    const [current, previous] = await Promise.all([
      sequelize.query(buildQuery(currentFilter),  { replacements: { device_id }, type: QueryTypes.SELECT }),
      sequelize.query(buildQuery(previousFilter), { replacements: { device_id }, type: QueryTypes.SELECT }),
    ]);

    res.json({ current, previous, source: useEnergyActive ? 'energy_active' : 'active_power_estimated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboards/power?device_id=1&start=...&end=...
router.get('/power', authenticate, async (req, res) => {
  try {
    const { device_id, start, end } = req.query;
    if (!device_id || !start || !end) {
      return res.status(400).json({ error: 'device_id, start, dan end diperlukan' });
    }
    const data = await sequelize.query(`
      SELECT timestamp as period, value as total
      FROM readings
      WHERE device_id = :device_id AND parameter = 'Active Power Total'
        AND timestamp BETWEEN :start AND :end
      ORDER BY timestamp ASC
    `, { replacements: { device_id, start, end }, type: QueryTypes.SELECT });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboards/pq?device_id=1&start=...&end=...
router.get('/pq', authenticate, async (req, res) => {
  try {
    const { device_id, start, end } = req.query;
    if (!device_id || !start || !end) {
      return res.status(400).json({ error: 'device_id, start, dan end diperlukan' });
    }
    const data = await sequelize.query(`
      SELECT timestamp, parameter, value FROM readings
      WHERE device_id = :device_id
        AND parameter IN ('THD Current A','THD Current B','THD Current C','THD Voltage AB')
        AND timestamp BETWEEN :start AND :end
      ORDER BY timestamp ASC
    `, { replacements: { device_id, start, end }, type: QueryTypes.SELECT });

    const grouped = {};
    data.forEach((row) => {
      if (!grouped[row.parameter]) grouped[row.parameter] = [];
      grouped[row.parameter].push({ period: row.timestamp, value: row.value });
    });
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboards/group/energy?group_id=1&range=today
router.get('/group/energy', authenticate, async (req, res) => {
  try {
    const { group_id, range } = req.query;
    if (!group_id) return res.status(400).json({ error: 'group_id diperlukan' });

    let truncate, filter;
    switch (range) {
      case 'today':
        truncate = 'hour';
        filter = "r.timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'";
        break;
      case 'thisWeek':
        truncate = 'day';
        filter = "r.timestamp >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      case 'thisMonth':
        truncate = 'day';
        filter = "r.timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      case 'thisYear':
        truncate = 'month';
        filter = "r.timestamp >= date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
        break;
      default:
        truncate = 'hour';
        filter = "r.timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'";
    }

    const data = await sequelize.query(`
      SELECT date_trunc('${truncate}', r.timestamp AT TIME ZONE 'Asia/Jakarta') as period,
             ROUND(CAST(SUM(GREATEST(0, r.value)) * 0.25 AS numeric), 2) as total
      FROM readings r
      JOIN devices d ON r.device_id = d.id
      WHERE d.group_id = :group_id AND r.parameter = 'Active Power Total' AND ${filter}
      GROUP BY period ORDER BY period
    `, { replacements: { group_id }, type: QueryTypes.SELECT });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboards/group/comparison
router.get('/group/comparison', authenticate, async (req, res) => {
  try {
    const { group_id, range } = req.query;
    const truncate = range === 'yearly' ? 'month' : 'day';
    const filter = range === 'yearly'
      ? "r.timestamp >= date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')"
      : "r.timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";

    const data = await sequelize.query(`
      SELECT d.name as device_name,
             date_trunc('${truncate}', r.timestamp AT TIME ZONE 'Asia/Jakarta') as period,
             ROUND(CAST(SUM(GREATEST(0, r.value)) * 0.25 AS numeric), 2) as total
      FROM readings r
      JOIN devices d ON r.device_id = d.id
      WHERE d.group_id = :group_id AND r.parameter = 'Active Power Total' AND ${filter}
      GROUP BY d.name, period ORDER BY period
    `, { replacements: { group_id }, type: QueryTypes.SELECT });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboards/group/kva
router.get('/group/kva', authenticate, async (req, res) => {
  try {
    const { group_id, start, end } = req.query;
    if (!group_id || !start || !end) {
      return res.status(400).json({ error: 'group_id, start, dan end diperlukan' });
    }
    const data = await sequelize.query(`
      SELECT r.timestamp as period, SUM(r.value) as total
      FROM readings r JOIN devices d ON r.device_id = d.id
      WHERE d.group_id = :group_id AND r.parameter = 'Apparent Power Total'
        AND r.timestamp BETWEEN :start AND :end
      GROUP BY r.timestamp ORDER BY r.timestamp
    `, { replacements: { group_id, start, end }, type: QueryTypes.SELECT });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;