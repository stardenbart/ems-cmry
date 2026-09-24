// Cek evaluasi aturan alarm. Tanpa database.
//   node test-alarm-rules.js
//
// Yang dijaga: durasi tahan. Tanpa itu, satu lonjakan sesaat sudah cukup
// membangunkan orang di tengah malam, dan alarm yang terlalu berisik akan
// diabaikan — sama saja dengan tidak punya alarm.
const assert = require('assert');
const { bandingkan, dalamJendela, evaluasi, isiTemplate } = require('./services/alarmRules');

// ── Perbandingan ────────────────────────────────────────────────────────────
assert.ok(bandingkan(10, '>', 5));
assert.ok(!bandingkan(5, '>', 5));
assert.ok(bandingkan(5, '>=', 5));
assert.ok(bandingkan(1, '<', 5));
assert.ok(!bandingkan('bukan angka', '>', 5), 'nilai bukan angka tidak memicu alarm');
assert.ok(!bandingkan(10, '?', 5), 'operator tidak dikenal tidak memicu alarm');

// ── Jendela aktif ───────────────────────────────────────────────────────────
const jam = (h, m) => new Date(2026, 8, 24, h, m || 0);
assert.ok(dalamJendela({}, jam(3)), 'tanpa jendela berarti sepanjang waktu');
assert.ok(dalamJendela({ active_from: '08:00', active_to: '17:00' }, jam(12)));
assert.ok(!dalamJendela({ active_from: '08:00', active_to: '17:00' }, jam(6)));
// Shift malam melewati tengah malam
assert.ok(dalamJendela({ active_from: '22:00', active_to: '06:00' }, jam(23)), 'shift malam, sebelum tengah malam');
assert.ok(dalamJendela({ active_from: '22:00', active_to: '06:00' }, jam(2)), 'shift malam, sesudah tengah malam');
assert.ok(!dalamJendela({ active_from: '22:00', active_to: '06:00' }, jam(12)), 'siang di luar shift malam');

// ── Durasi tahan ────────────────────────────────────────────────────────────
const RULE = { enabled: true, operator: '>', threshold: 100, hold_seconds: 60 };
const t0 = new Date(2026, 8, 24, 10, 0, 0);
const detik = (s) => new Date(t0.getTime() + s * 1000);

let st = null;
let r = evaluasi(RULE, 150, st, t0);
assert.strictEqual(r.aksi, null, 'baru melanggar, belum menyala');
st = r.state;

r = evaluasi(RULE, 150, st, detik(30));
assert.strictEqual(r.aksi, null, '30 detik belum cukup');
st = r.state;

r = evaluasi(RULE, 150, st, detik(61));
assert.strictEqual(r.aksi, 'nyala', 'lewat 60 detik harus menyala');
st = r.state;

r = evaluasi(RULE, 150, st, detik(90));
assert.strictEqual(r.aksi, null, 'sudah menyala, tidak menyala berulang');
st = r.state;

r = evaluasi(RULE, 50, st, detik(120));
assert.strictEqual(r.aksi, 'padam', 'kembali normal harus padam');
st = r.state;

// Lonjakan sesaat tidak boleh memicu apa pun.
let kedip = null;
kedip = evaluasi(RULE, 150, kedip, t0).state;
const hasilKedip = evaluasi(RULE, 50, kedip, detik(5));
assert.strictEqual(hasilKedip.aksi, null, 'lonjakan 5 detik tidak memicu alarm');
assert.strictEqual(hasilKedip.state.melanggarSejak, null, 'penghitung direset saat normal');

// hold_seconds 0 berarti langsung menyala.
const LANGSUNG = { ...RULE, hold_seconds: 0 };
assert.strictEqual(evaluasi(LANGSUNG, 150, null, t0).aksi, 'nyala', 'tanpa durasi tahan langsung menyala');

// Aturan dimatikan harus memadamkan alarm yang sedang menyala.
const mati = evaluasi({ ...RULE, enabled: false }, 150, { melanggarSejak: t0, menyala: true }, detik(120));
assert.strictEqual(mati.aksi, 'padam', 'aturan dimatikan harus memadamkan');

// Keluar dari jendela aktif juga memadamkan, bukan menggantung sampai besok.
const JENDELA = { ...RULE, active_from: '08:00', active_to: '17:00', hold_seconds: 0 };
const luar = evaluasi(JENDELA, 150, { melanggarSejak: t0, menyala: true }, jam(20));
assert.strictEqual(luar.aksi, 'padam', 'di luar jendela aktif harus padam');

// ── Template ────────────────────────────────────────────────────────────────
const teks = isiTemplate('[{{severity}}] {{rule}} pada {{device}}: {{value}} {{unit}}',
  { severity: 'critical', rule: 'Tekanan tinggi', device: 'PM-1', value: 12.5, unit: 'bar' });
assert.strictEqual(teks, '[critical] Tekanan tinggi pada PM-1: 12.5 bar');

// Penanda tidak dikenal dibiarkan, supaya salah ketik terlihat.
assert.strictEqual(isiTemplate('halo {{tidakada}}', { a: 1 }), 'halo {{tidakada}}');
assert.strictEqual(isiTemplate('spasi {{ device }}', { device: 'X' }), 'spasi X', 'spasi di dalam penanda');

console.log('PASS — evaluasi aturan alarm');
