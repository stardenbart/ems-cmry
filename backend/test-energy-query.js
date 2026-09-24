// Cek rumus energi di routes/dashboards.js terhadap data sungguhan.
// Jalankan dari folder backend:  node test-energy-query.js
//
// Yang dijaga:
//  1. tidak ada bucket harian yang melebihi batas fisik (24 jam x daya puncak)
//     -> menangkap regresi reset akumulator dan selisih yang menjembatani jeda
//  2. tidak ada bucket negatif
//  3. total bulanan masuk akal (> 0)
const assert = require('assert');
const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

const LOG_INTERVAL_MINUTES = parseInt(process.env.LOG_INTERVAL_MINUTES) || 15;
const MAX_GAP_MINUTES = LOG_INTERVAL_MINUTES * 4;

const FILTER = "timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";

const SQL = `
  SELECT period, ROUND(CAST(SUM(delta) / 1000 AS numeric), 2) as total
  FROM (
    SELECT date_trunc('day', timestamp AT TIME ZONE 'Asia/Jakarta') as period,
           CASE
             WHEN timestamp - LAG(timestamp) OVER (ORDER BY timestamp)
                  <= INTERVAL '${MAX_GAP_MINUTES} minutes'
             THEN GREATEST(0, value - LAG(value) OVER (ORDER BY timestamp))
           END as delta
    FROM readings
    WHERE device_id = :device_id
      AND parameter = 'Active Energy Delivered (Into Load)'
      AND value > 0
      AND ${FILTER}
  ) d
  GROUP BY period ORDER BY period`;

(async () => {
  const device_id = 1;

  const [{ max_kw }] = await sequelize.query(
    `SELECT MAX(value) as max_kw FROM readings
      WHERE device_id = :device_id AND parameter = 'Active Power Total' AND ${FILTER}`,
    { replacements: { device_id }, type: QueryTypes.SELECT });

  // Batas fisik: daya puncak tidak mungkin dipertahankan lebih dari 24 jam penuh.
  const ceiling = Number(max_kw) * 24 * 1.05;
  const rows = await sequelize.query(SQL, { replacements: { device_id }, type: QueryTypes.SELECT });

  assert.ok(rows.length > 0, 'tidak ada data energi bulan ini');
  console.log(`daya puncak ${Number(max_kw).toFixed(1)} kW -> batas harian ${ceiling.toFixed(0)} kWh`);

  let sum = 0;
  for (const r of rows) {
    const kwh = Number(r.total);
    const hari = String(r.period).slice(0, 15);
    assert.ok(kwh >= 0, `bucket negatif di ${hari}: ${kwh}`);
    assert.ok(kwh <= ceiling, `bucket ${hari} = ${kwh} kWh melebihi batas fisik ${ceiling.toFixed(0)} kWh`);
    sum += kwh;
  }

  assert.ok(sum > 0, 'total bulanan nol');
  console.log(`${rows.length} bucket harian OK, total bulan ini ${sum.toFixed(2)} kWh`);
  console.log('PASS');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
