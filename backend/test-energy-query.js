// Cek rumus energi terhadap data sungguhan. Perlu koneksi database.
//   node test-energy-query.js
//
// Memakai builder yang sama dengan yang dipakai endpoint, bukan salinannya,
// supaya test ini ikut gagal kalau rumusnya berubah.
//
// Yang dijaga:
//  1. tidak ada bucket harian yang melebihi batas fisik (24 jam x daya puncak)
//  2. tidak ada bucket negatif
//  3. TOTAL bucket harus sama dengan selisih akumulator mentah. Ini yang
//     menangkap energi hilang akibat jeda logging — audit 24 Sep 2026 sempat
//     kehilangan 3.340 dari 14.492 kWh sebelum penyebaran proporsional dipakai.
require('dotenv').config();
const assert = require('assert');
const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');
const { buildSql } = require('./services/aggregation');

const PARAM = 'Active Energy Delivered (Into Load)';
const FILTER_BULAN = "timestamp >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
const FILTER_HARI = "timestamp >= CURRENT_DATE AT TIME ZONE 'Asia/Jakarta'";

(async () => {
  const device_id = 1;
  const pilih = (sql, r) => sequelize.query(sql, { replacements: r, type: QueryTypes.SELECT });

  const [{ max_kw }] = await pilih(
    `SELECT MAX(value) AS max_kw FROM readings
      WHERE device_id = :device_id AND parameter = 'Active Power Total' AND ${FILTER_BULAN}`,
    { device_id });

  const batas = Number(max_kw) * 24 * 1.05;
  const bulan = await pilih(buildSql('counter', 'day', FILTER_BULAN), { device_id, parameter: PARAM });

  assert.ok(bulan.length > 0, 'tidak ada data energi bulan ini');
  console.log(`daya puncak ${Number(max_kw).toFixed(1)} kW -> batas harian ${batas.toFixed(0)} kWh`);

  let jumlah = 0;
  for (const r of bulan) {
    const kwh = Number(r.total) / 1000;   // builder mengembalikan satuan dasar (Wh)
    const hari = String(r.period).slice(0, 15);
    assert.ok(kwh >= 0, `bucket negatif di ${hari}: ${kwh}`);
    assert.ok(kwh <= batas, `bucket ${hari} = ${kwh.toFixed(1)} kWh melebihi batas fisik ${batas.toFixed(0)}`);
    jumlah += kwh;
  }
  assert.ok(jumlah > 0, 'total bulanan nol');
  console.log(`${bulan.length} bucket harian OK, total bulan ini ${jumlah.toFixed(2)} kWh`);

  // Selisih akumulator mentah hari ini adalah kebenaran yang tidak terbantah.
  // Jumlah seluruh bucket harus sama dengannya.
  const [mentah] = await pilih(
    `SELECT MIN(value) AS awal, MAX(value) AS akhir, COUNT(*) AS n
       FROM readings
      WHERE device_id = :device_id AND parameter = :parameter AND value > 0 AND ${FILTER_HARI}`,
    { device_id, parameter: PARAM });

  if (Number(mentah.n) > 2) {
    const selisihMentah = (Number(mentah.akhir) - Number(mentah.awal)) / 1000;
    const hariIni = await pilih(buildSql('counter', 'hour', FILTER_HARI), { device_id, parameter: PARAM });
    const totalBucket = hariIni.reduce((t, r) => t + Number(r.total), 0) / 1000;

    // Toleransi 1%: selisih pertama tiap rentang memang tidak punya pasangan.
    const beda = Math.abs(totalBucket - selisihMentah);
    const persen = selisihMentah === 0 ? 0 : (beda / selisihMentah) * 100;

    console.log(`hari ini: bucket ${totalBucket.toFixed(2)} kWh vs akumulator ${selisihMentah.toFixed(2)} kWh (beda ${persen.toFixed(2)}%)`);
    assert.ok(persen < 1,
      `energi hilang dari chart: bucket ${totalBucket.toFixed(2)} kWh vs akumulator ${selisihMentah.toFixed(2)} kWh`);
  } else {
    console.log('hari ini: sampel belum cukup untuk memeriksa keutuhan total');
  }

  console.log('PASS');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
