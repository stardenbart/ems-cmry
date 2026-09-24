const router = require('express').Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getLatestData } = require('../websocket/wsServer');
const EnergyConversion = require('../models/EnergyConversion');
const agg = require('../services/aggregation');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: cek apakah 'Active Energy Delivered (Into Load)' punya data valid (> 0)
// di DB untuk device ini. Kalau tidak ada, fallback pakai estimasi Active Power Total
// ─────────────────────────────────────────────────────────────────────────────
async function hasEnergyActiveData(device_id) {
  const result = await sequelize.query(`
    SELECT 1 FROM readings
    WHERE device_id = :device_id
      AND parameter = 'Active Energy Delivered (Into Load)'
      AND value > 0
    LIMIT 1
  `, { replacements: { device_id }, type: QueryTypes.SELECT });
  return result.length > 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Energy per periode dari register akumulator.
//
// Akumulator meter bisa di-reset — terjadi 1 Sep 2026 10:00 WIB, nilainya terjun
// dari 2.022.839.359 Wh ke 4.499 Wh. Rumus lama MAX-MIN per periode menghitung
// seluruh angka sebelum reset sebagai pemakaian satu hari (2.026.830 kWh, padahal
// normalnya ~18.000 kWh). Jumlahkan selisih antar-pembacaan yang positif saja:
// tahan terhadap reset maupun rollover counter.
//
// Selisih pertama tiap rentang bernilai NULL (tidak ada pembacaan sebelumnya) dan
// otomatis diabaikan SUM — sama seperti perilaku MAX-MIN sebelumnya.
//
// Selisih yang menjembatani jeda logging disebar proporsional sepanjang waktunya,
// bukan dibuang dan bukan ditimbun di satu bucket. Rinciannya di
// services/aggregation.js.
// ────────────────────────────────────────────────────────────────────────────
const ENERGY_PARAM = 'Active Energy Delivered (Into Load)';

// Pembungkus tipis di atas builder generik di services/aggregation.js, supaya
// rumus counter (selisih positif, tahan reset meter, tahan jeda logging) hanya
// hidup di satu tempat. Yang ditambahkan di sini cuma konversi Wh -> kWh.
function energyQuery(truncate, filter) {
  return `SELECT period, ROUND(CAST(total / 1000 AS numeric), 2) AS total
            FROM (${agg.buildSql('counter', truncate, filter)}) e`;
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
// Mengembalikan nilai base energy pertama hari ini (dalam kWh) untuk dihitung
// selisihnya dengan nilai realtime.
//
// source: 'energy_active'          → pakai register akumulator meter (kWh = Wh / 1000)
// source: 'active_power_estimated' → fallback estimasi dari Active Power Total
// source: 'none'                   → belum ada data sama sekali
// ─────────────────────────────────────────────────────────────────────────────
router.get('/energy-today', authenticate, async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ error: 'device_id diperlukan' });

    // Coba ambil nilai pertama hari ini dari register energy akumulator (Wh)
    const energyResult = await sequelize.query(`
      SELECT value FROM readings
      WHERE device_id = :device_id
        AND parameter = 'Active Energy Delivered (Into Load)'
        AND value > 0
        AND timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'
      ORDER BY timestamp ASC
      LIMIT 1
    `, { replacements: { device_id }, type: QueryTypes.SELECT });

    if (energyResult.length > 0) {
      // Konversi Wh → kWh
      return res.json({
        base: parseFloat(energyResult[0].value) / 1000,
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
// Kalau register energy ada data valid → pakai MAX-MIN per periode (kWh = Wh / 1000)
// Kalau tidak ada → estimasi dari Active Power Total × 0.25 jam
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
      data = await sequelize.query(energyQuery(truncate, filter),
        { replacements: { device_id, parameter: ENERGY_PARAM }, type: QueryTypes.SELECT });
    } else {
      // Fallback: estimasi dari Active Power Total
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

    const buildQuery = (filter) => useEnergyActive
      ? energyQuery(truncate, filter)
      : `
      SELECT date_trunc('${truncate}', timestamp AT TIME ZONE 'Asia/Jakarta') as period,
             ROUND(CAST(SUM(value) * 0.25 AS numeric), 2) as total
      FROM readings
      WHERE device_id = :device_id AND parameter = 'Active Power Total'
        AND ${filter}
      GROUP BY period ORDER BY period
    `;

    const [current, previous] = await Promise.all([
      sequelize.query(buildQuery(currentFilter),  { replacements: { device_id, parameter: ENERGY_PARAM }, type: QueryTypes.SELECT }),
      sequelize.query(buildQuery(previousFilter), { replacements: { device_id, parameter: ENERGY_PARAM }, type: QueryTypes.SELECT }),
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

// ────────────────────────────────────────────────────────────────────────────
// GET /api/dashboards/series?device_id=1&parameter=Pressure%20Line%201&range=today&unit=bar
//
// Endpoint generik untuk SEMUA jenis besaran. Rumus agregasinya dipilih dari
// metadata `agg` milik parameter, bukan dari namanya, sehingga pressure dan
// temperature terlayani tanpa menambah endpoint baru.
// ────────────────────────────────────────────────────────────────────────────
router.get('/series', authenticate, async (req, res) => {
  try {
    const { device_id, parameter, range, unit } = req.query;
    if (!device_id || !parameter) {
      return res.status(400).json({ error: 'device_id dan parameter diperlukan' });
    }

    const meta = await agg.parameterMeta(device_id, parameter);
    if (!meta) return res.status(404).json({ error: 'Parameter tidak ada pada device ini' });

    const aggMode = meta.agg === 'counter' ? 'counter' : 'gauge';
    const rows = await agg.aggregate({ device_id, parameter, agg: aggMode, range });
    const target = unit || meta.unit || null;
    const data = await agg.convertRows(rows, aggMode, meta.unit || null, target);

    res.json({
      parameter,
      kind: meta.kind || 'other',
      agg: aggMode,
      unit: target,
      precision: meta.precision !== undefined ? meta.precision : 2,
      data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/dashboards/kinds
//
// Daftar jenis besaran yang BENAR-BENAR ada datanya, beserta device dan
// parameter yang memilikinya. Daftar halaman dashboard tumbuh dari sini, jadi
// memasang sensor jenis baru memunculkan halamannya tanpa deploy.
// ────────────────────────────────────────────────────────────────────────────
router.get('/kinds', authenticate, async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT d.id AS device_id, d.name AS device_name, dt.params
        FROM devices d JOIN device_types dt ON dt.id = d.device_type_id
       ORDER BY d.name`, { type: QueryTypes.SELECT });

    const kinds = {};
    for (const r of rows) {
      const params = typeof r.params === 'string' ? JSON.parse(r.params) : (r.params || []);
      for (const p of params) {
        if (p.save === false) continue;
        const kind = p.kind || 'other';
        const k = (kinds[kind] = kinds[kind] || { kind, units: new Set(), items: [] });
        k.units.add(p.unit || '-');
        k.items.push({
          deviceId: r.device_id, deviceName: r.device_name,
          parameter: p.name, unit: p.unit || '-',
          agg: p.agg || 'gauge', precision: p.precision === undefined ? 2 : p.precision,
          featured: p.featured === true,
        });
      }
    }

    res.json(Object.values(kinds)
      .map((k) => ({ kind: k.kind, units: [...k.units], count: k.items.length, items: k.items }))
      .sort((a, b) => b.count - a.count));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
