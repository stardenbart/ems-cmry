// Agregasi generik untuk semua jenis besaran.
//
// Rumusnya ditentukan oleh metadata `agg` pada parameter, bukan oleh nama
// parameternya. Ini yang membuat pressure, temperature, dan flow ikut terlayani
// tanpa menambah kode per jenis besaran.
//
//   counter  akumulator yang selalu naik (energi, flow totalizer)
//            -> jumlah selisih positif antar pembacaan berurutan
//   gauge    nilai sesaat (power, suhu, tekanan, power factor)
//            -> rata-rata, minimum, maksimum. TIDAK boleh dijumlah.
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { convertValue, convertDelta } = require('./units');

const LOG_INTERVAL_MINUTES = parseInt(process.env.LOG_INTERVAL_MINUTES) || 15;


const RANGES = {
  today:     { truncate: 'hour',  filter: "timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'" },
  thisWeek:  { truncate: 'day',   filter: "timestamp >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')" },
  thisMonth: { truncate: 'day',   filter: "timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')" },
  thisYear:  { truncate: 'month', filter: "timestamp >= date_trunc('year', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')" },
};

function resolveRange(range) {
  return RANGES[range] || RANGES.today;
}

// Akumulator: jumlah selisih positif. GREATEST(0, ...) membuang langkah negatif
// saat meter di-reset (1 Sep 2026 nilainya terjun dari 2.022.839.359 Wh ke 4.499 Wh).
// Baris ber-quality suspect TIDAK disembunyikan. Menyembunyikannya akan membuang
// data berbulan-bulan hanya karena satu register salah skala, dan membuat grafik
// bolong tanpa penjelasan. Datanya tetap dihitung, jumlah baris mencurigakan
// dilaporkan lewat suspect_count supaya UI bisa menandainya.
//
// SELISIH DISEBAR PROPORSIONAL SEPANJANG WAKTUNYA.
//
// Versi sebelumnya membuang selisih yang menjembatani jeda logging. Audit 24 Sep
// 2026 menunjukkan akibatnya terlalu besar: chart harian kurang 3.340 dari
// 14.492 kWh, atau 23%, hanya karena dua jeda. Akumulator meter sebenarnya sudah
// tahu persis berapa energi yang lewat selama jeda itu, jadi membuangnya berarti
// membuang informasi yang akurat.
//
// Menimbunnya di satu bucket juga salah: jeda 3 hari 18 jam pernah membuat satu
// hari terbaca 67.958 kWh. Maka selisihnya dibagi ke setiap bucket sesuai lama
// irisan waktunya. Totalnya tetap utuh dan sebarannya wajar.
//
// GREATEST(0, ...) tetap membuang langkah negatif saat meter di-reset (1 Sep 2026
// nilainya terjun dari 2.022.839.359 Wh ke 4.499 Wh).
function counterSql(truncate, filter) {
  return `
    WITH pasangan AS (
      SELECT LAG(timestamp AT TIME ZONE 'Asia/Jakarta') OVER (ORDER BY timestamp) AS t0,
             (timestamp AT TIME ZONE 'Asia/Jakarta') AS t1,
             GREATEST(0, value - LAG(value) OVER (ORDER BY timestamp)) AS d,
             CASE WHEN quality <> 0 THEN 1 ELSE 0 END AS suspect
        FROM readings
       WHERE device_id = :device_id
         AND parameter = :parameter
         AND value > 0
         AND ${filter}
    ),
    sebar AS (
      SELECT date_trunc('${truncate}', gs) AS period,
             p.d * EXTRACT(EPOCH FROM (LEAST(p.t1, gs + INTERVAL '1 ${truncate}') - GREATEST(p.t0, gs)))
                 / NULLIF(EXTRACT(EPOCH FROM (p.t1 - p.t0)), 0) AS bagian,
             p.suspect
        FROM pasangan p
        CROSS JOIN LATERAL generate_series(date_trunc('${truncate}', p.t0), p.t1, INTERVAL '1 ${truncate}') gs
       WHERE p.t0 IS NOT NULL AND p.d > 0
    )
    SELECT period,
           ROUND(CAST(SUM(bagian) AS numeric), 4) AS total,
           SUM(suspect) AS suspect_count
      FROM sebar
     GROUP BY period ORDER BY period`;
}

// Gauge: rata-rata sebagai nilai utama, min dan max sebagai konteks.
function gaugeSql(truncate, filter) {
  return `
    SELECT date_trunc('${truncate}', timestamp AT TIME ZONE 'Asia/Jakarta') AS period,
           ROUND(CAST(AVG(value) AS numeric), 4) AS total,
           ROUND(CAST(MIN(value) AS numeric), 4) AS min_value,
           ROUND(CAST(MAX(value) AS numeric), 4) AS max_value,
           SUM(CASE WHEN quality <> 0 THEN 1 ELSE 0 END) AS suspect_count
    FROM readings
    WHERE device_id = :device_id
      AND parameter = :parameter
      AND ${filter}
    GROUP BY period ORDER BY period`;
}

function buildSql(agg, truncate, filter) {
  return agg === 'counter' ? counterSql(truncate, filter) : gaugeSql(truncate, filter);
}

// Jalankan agregasi untuk satu device dan satu parameter.
async function aggregate({ device_id, parameter, agg, range, truncate, filter }) {
  const r = resolveRange(range);
  const sql = buildSql(agg, truncate || r.truncate, filter || r.filter);
  return sequelize.query(sql, {
    replacements: { device_id, parameter },
    type: QueryTypes.SELECT,
  });
}

// Ambil metadata satu parameter dari device_types milik device tersebut.
// Dipakai endpoint generik supaya pemanggil tidak perlu tahu jenis besarannya.
async function parameterMeta(device_id, parameter) {
  const [row] = await sequelize.query(`
    SELECT dt.params
      FROM devices d
      JOIN device_types dt ON dt.id = d.device_type_id
     WHERE d.id = :device_id`, { replacements: { device_id }, type: QueryTypes.SELECT });

  if (!row) return null;
  const params = typeof row.params === 'string' ? JSON.parse(row.params) : (row.params || []);
  return params.find((p) => p.name === parameter) || null;
}

// ── Konversi satuan ─────────────────────────────────────────────────────────
// Nilai disimpan mentah; konversi dilakukan saat dibaca. Dengan begitu,
// membetulkan faktor yang salah otomatis membetulkan seluruh riwayat, tanpa
// perlu UPDATE massal seperti koreksi 73 baris pada 24 Sep 2026.
let unitCache = null;

async function loadUnits() {
  const rows = await sequelize.query(
    'SELECT symbol, quantity, base_symbol, factor, offset_value FROM units',
    { type: QueryTypes.SELECT });
  unitCache = {};
  rows.forEach((u) => { unitCache[u.symbol] = u; });
  return unitCache;
}

async function units() {
  return unitCache || loadUnits();
}

function invalidateUnits() {
  unitCache = null;
}

// Terapkan konversi pada hasil aggregate(). Baris counter berisi selisih,
// baris gauge berisi nilai, jadi keduanya dikonversi dengan aturan berbeda.
async function convertRows(rows, agg, from, to) {
  if (!from || !to || from === to) return rows;
  const map = await units();
  const fn = agg === 'counter' ? convertDelta : convertValue;
  return rows.map((r) => ({
    ...r,
    total: r.total === null ? null : fn(r.total, from, to, map),
    ...(r.min_value !== undefined ? { min_value: convertValue(r.min_value, from, to, map) } : {}),
    ...(r.max_value !== undefined ? { max_value: convertValue(r.max_value, from, to, map) } : {}),
  }));
}

module.exports = {
  aggregate,
  buildSql,
  parameterMeta,
  resolveRange,
  units,
  invalidateUnits,
  convertValue,
  convertDelta,
  convertRows,
};
