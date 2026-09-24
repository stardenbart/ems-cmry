// Cek penyesuaian nilai setelah dekode. Tanpa database.
//   node test-decode.js
//
// Angka yang dipakai diambil dari pindaian register PM2200 pada 24 Sep 2026,
// supaya kalau pelipatannya rusak, test ini gagal dengan kasus nyata.
const assert = require('assert');
const { lipatPowerFactor, terapkan } = require('./services/decode');

const dekat = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ── Power factor, nilai nyata dari meter ────────────────────────────────────
assert.ok(dekat(lipatPowerFactor(0.95982), 0.95982), 'PF fasa A lagging, tidak berubah');
assert.ok(dekat(lipatPowerFactor(0.369817), 0.369817), 'PF fasa B lagging, tidak berubah');
assert.ok(dekat(lipatPowerFactor(1.304324), -0.695676), 'PF fasa C leading, dilipat jadi negatif');
assert.ok(dekat(lipatPowerFactor(0.668937), 0.668937), 'PF total lagging');

// Batas
assert.ok(dekat(lipatPowerFactor(1), 1), 'tepat 1 tidak dilipat');
assert.ok(dekat(lipatPowerFactor(-1), -1), 'tepat -1 tidak dilipat');
assert.ok(dekat(lipatPowerFactor(2), 0), 'nilai 2 berarti PF nol leading');
assert.ok(dekat(lipatPowerFactor(-1.3), 0.7), 'sisi negatif juga dilipat');

// Hasil pelipatan harus selalu berada di rentang yang masuk akal.
[0.1, 0.5, 0.95982, 1.304324, 1.9, -1.5, -0.3].forEach((v) => {
  const h = lipatPowerFactor(v);
  assert.ok(h >= -1 && h <= 1, `hasil ${v} -> ${h} harus di dalam [-1, 1]`);
});

// Nilai kosong dan bukan angka aman.
assert.strictEqual(lipatPowerFactor(null), null);
assert.strictEqual(lipatPowerFactor(undefined), undefined);
assert.strictEqual(lipatPowerFactor('abc'), null, 'bukan angka jadi null, bukan NaN');

// ── terapkan() sesuai conv_mode ─────────────────────────────────────────────
assert.ok(dekat(terapkan(1.304324, { conv_mode: 'pf_ieee' }), -0.695676));
assert.strictEqual(terapkan(1.304324, { conv_mode: 'none' }), 1.304324, 'mode none tidak menyentuh nilai');
assert.strictEqual(terapkan(1.304324, {}), 1.304324, 'tanpa conv_mode dianggap none');

// Mode manual: sensor 0..10000 mewakili 0..16 bar
assert.ok(dekat(terapkan(10000, { conv_mode: 'manual', scale: 0.0016 }), 16), 'skala tekanan');
assert.ok(dekat(terapkan(300, { conv_mode: 'manual', scale: 1, offset: -273.15 }), 26.85), 'Kelvin ke Celsius');
assert.ok(dekat(terapkan(253, { conv_mode: 'manual', scale: 0.1 }), 25.3), 'persepuluhan derajat');
assert.strictEqual(terapkan(5, { conv_mode: 'manual' }), 5, 'manual tanpa scale/offset tidak mengubah');

assert.strictEqual(terapkan(null, { conv_mode: 'manual', scale: 2 }), null, 'null lewat');

console.log('PASS — penyesuaian nilai setelah dekode');
