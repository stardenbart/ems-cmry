// Cek konversi satuan. Tidak butuh database.
//   node test-units.js
//
// Yang dijaga: selisih dikonversi TANPA offset. Beda 10 K sama dengan beda
// 10 derajat Celsius; kalau offset ikut terpakai hasilnya jadi -263 dan seluruh
// perhitungan suhu per periode salah tanpa terlihat mencurigakan.
const assert = require('assert');
const { convertValue, convertDelta } = require('./services/units');

const MAP = {
  Wh:     { symbol: 'Wh',    quantity: 'energy',      base_symbol: 'Wh',   factor: 1,      offset_value: 0 },
  kWh:    { symbol: 'kWh',   quantity: 'energy',      base_symbol: 'Wh',   factor: 1000,   offset_value: 0 },
  MWh:    { symbol: 'MWh',   quantity: 'energy',      base_symbol: 'Wh',   factor: 1e6,    offset_value: 0 },
  degC:   { symbol: 'degC',  quantity: 'temperature', base_symbol: 'degC', factor: 1,      offset_value: 0 },
  K:      { symbol: 'K',     quantity: 'temperature', base_symbol: 'degC', factor: 1,      offset_value: -273.15 },
  bar:    { symbol: 'bar',   quantity: 'pressure',    base_symbol: 'Pa',   factor: 100000, offset_value: 0 },
  Pa:     { symbol: 'Pa',    quantity: 'pressure',    base_symbol: 'Pa',   factor: 1,      offset_value: 0 },
  A:      { symbol: 'A',     quantity: 'current',     base_symbol: 'A',    factor: 1,      offset_value: 0 },
  V:      { symbol: 'V',     quantity: 'voltage',     base_symbol: 'V',    factor: 1,      offset_value: 0 },
};

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// Energi: skala murni, nilai dan selisih diperlakukan sama.
assert.ok(near(convertValue(1000, 'Wh', 'kWh', MAP), 1), 'Wh -> kWh nilai');
assert.ok(near(convertDelta(1000, 'Wh', 'kWh', MAP), 1), 'Wh -> kWh selisih');
assert.ok(near(convertValue(2.5e6, 'Wh', 'MWh', MAP), 2.5), 'Wh -> MWh');
assert.ok(near(convertValue(1, 'kWh', 'Wh', MAP), 1000), 'kWh -> Wh');

// Suhu: di sinilah offset membedakan nilai dan selisih.
assert.ok(near(convertValue(300, 'K', 'degC', MAP), 26.85, 1e-9), 'K -> degC nilai');
assert.ok(near(convertDelta(10, 'K', 'degC', MAP), 10), 'K -> degC selisih tidak kena offset');
assert.ok(near(convertValue(0, 'degC', 'K', MAP), 273.15, 1e-9), 'degC -> K nilai');

// Tekanan
assert.ok(near(convertValue(1, 'bar', 'Pa', MAP), 100000), 'bar -> Pa');
assert.ok(near(convertValue(250000, 'Pa', 'bar', MAP), 2.5), 'Pa -> bar');

// Satuan beda besaran tidak dikonversi diam-diam, nilainya dikembalikan apa adanya.
assert.strictEqual(convertValue(5, 'A', 'V', MAP), 5, 'besaran berbeda tidak dikonversi');
assert.strictEqual(convertValue(5, 'A', 'A', MAP), 5, 'satuan sama');

// Nilai kosong lewat tanpa diproses.
assert.strictEqual(convertValue(null, 'Wh', 'kWh', MAP), null, 'null lewat');
assert.strictEqual(convertDelta(undefined, 'Wh', 'kWh', MAP), undefined, 'undefined lewat');

// Satuan tidak dikenal tidak boleh membuat crash.
assert.strictEqual(convertValue(7, 'Wh', 'xyz', MAP), 7, 'satuan tidak dikenal');

console.log('PASS — 14 pemeriksaan konversi satuan');
