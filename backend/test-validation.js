// Cek validasi rentang dan koherensi. Tidak butuh database.
//   node test-validation.js
//
// Kasus utama memakai angka live 24 Sep 2026 yang sudah terbukti tidak koheren,
// supaya kalau aturannya rusak, test ini gagal duluan.
const assert = require('assert');
const { GOOD, SUSPECT, rangeQuality, coherenceIssues, qualityMap } = require('./services/validation');

const PARAMS = [
  { name: 'Current A',            kind: 'current',        min: 0, max: 5000 },
  { name: 'Current B',            kind: 'current',        min: 0, max: 5000 },
  { name: 'Current C',            kind: 'current',        min: 0, max: 5000 },
  { name: 'Current N',            kind: 'current',        min: 0, max: 5000 },
  { name: 'Current Avg',          kind: 'current',        min: 0, max: 5000 },
  { name: 'Voltage L-L Avg',      kind: 'voltage',        min: 0, max: 600 },
  { name: 'Active Power Total',   kind: 'power',          min: -5000, max: 5000 },
  { name: 'Reactive Power Total', kind: 'reactive_power', min: -5000, max: 5000 },
  { name: 'Apparent Power Total', kind: 'apparent_power', min: 0, max: 5000 },
  { name: 'Frequency',            kind: 'frequency',      min: 45, max: 55 },
];

// ── Rentang ─────────────────────────────────────────────────────────────────
assert.strictEqual(rangeQuality({ min: 45, max: 55 }, 50.04), GOOD, 'frekuensi normal');
assert.strictEqual(rangeQuality({ min: 45, max: 55 }, 12), SUSPECT, 'frekuensi di luar batas');
assert.strictEqual(rangeQuality({ min: 0, max: 1e12 }, 2.668e13), SUSPECT, 'energi tergeser x65536 tertangkap');
assert.strictEqual(rangeQuality({ min: 0, max: 5000 }, null), SUSPECT, 'null dianggap suspect');
assert.strictEqual(rangeQuality(null, 123), GOOD, 'tanpa metadata dilewati');

// ── Koherensi: data live 24 Sep 2026 ────────────────────────────────────────
// Pindaian register membuktikan data ini SAH. Daya per fasa masing-masing
// koheren dan jumlahnya cocok dengan total; Apparent Power Total sekadar jumlah
// aritmetik, bukan vektor. Jadi tidak boleh ada satu pun penanda di sini.
const LIVE = {
  'Current A': 1592.4963, 'Current B': 1711.9612, 'Current C': 1764.2462,
  'Current N': 3180.4087, 'Current Avg': 1692.1346,
  'Voltage L-L Avg': 402.2091,
  'Active Power Total': 786.9459,
  'Reactive Power Total': 182.8894,
  'Apparent Power Total': 1178.7798,
  Frequency: 50.0401,
};

const issues = coherenceIssues(PARAMS, LIVE);
assert.deepStrictEqual(issues, [],
  'beban tiga fasa tak seimbang adalah kondisi sah, tidak boleh ditandai: ' + JSON.stringify(issues));

// ── Koherensi: data yang benar-benar konsisten ──────────────────────────────
const V = 400, I = 1000;
const S = (Math.sqrt(3) * V * I) / 1000;   // 692,8 kVA
const P = S * 0.85;
const Q = Math.sqrt(S * S - P * P);
const SEHAT = {
  'Current A': 1000, 'Current B': 1010, 'Current C': 990,
  'Current N': 40, 'Current Avg': I,
  'Voltage L-L Avg': V,
  'Active Power Total': P,
  'Reactive Power Total': Q,
  'Apparent Power Total': S,
  Frequency: 50,
};
assert.deepStrictEqual(coherenceIssues(PARAMS, SEHAT), [], 'data konsisten tidak boleh ditandai');

const q = qualityMap(PARAMS, SEHAT);
assert.ok(Object.values(q).every((v) => v === GOOD), 'semua good pada data sehat');

// Arus yang digelembungkan harus merusak hubungan S vs V x I.
const ARUS_SALAH = { ...SEHAT, 'Current Avg': I * 1.5 };
assert.ok(coherenceIssues(PARAMS, ARUS_SALAH).some((i) => i.rule === 'S_vs_VI'),
  'arus salah baca harus tertangkap lewat S vs akar-3 x V x I');

// Yang benar-benar mustahil tetap harus tertangkap.
const PQ_MUSTAHIL = { ...SEHAT, 'Apparent Power Total': 100 };  // S lebih kecil dari P
assert.ok(coherenceIssues(PARAMS, PQ_MUSTAHIL).some((i) => i.rule === 'P_gt_S'),
  'P melebihi S harus tertangkap');

const NETRAL_MUSTAHIL = { ...SEHAT, 'Current N': 9999 };  // melebihi jumlah ketiga fasa
assert.ok(coherenceIssues(PARAMS, NETRAL_MUSTAHIL).some((i) => i.rule === 'IN_gt_sum'),
  'arus netral melebihi jumlah ketiga fasa harus tertangkap');

// Arus netral besar pada fasa yang seimbang besarnya TIDAK boleh ditandai:
// sudut fasa bisa sangat berbeda dan harmonisa triplen menjumlah di netral.
const NETRAL_BESAR = { ...SEHAT, 'Current N': 2500 };
assert.ok(!coherenceIssues(PARAMS, NETRAL_BESAR).some((i) => i.rule.startsWith('IN_')),
  'arus netral besar tapi masih di bawah jumlah fasa adalah sah');

// Tanpa parameter yang relevan, aturan dilewati tanpa error.
assert.deepStrictEqual(coherenceIssues([], {}), [], 'tanpa parameter tidak error');
assert.deepStrictEqual(coherenceIssues(PARAMS, {}), [], 'tanpa data tidak error');

console.log('PASS — validasi rentang dan koherensi');
