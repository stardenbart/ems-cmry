// Cek kalender shift. Tanpa database.
//   node test-shift.js
//
// Yang dijaga: shift malam yang melewati tengah malam harus dihitung MILIK HARI
// SAAT SHIFT DIMULAI. Kalau tidak, produksi jam 02:00 tercatat di hari kalender
// berikutnya sementara operator menganggapnya masih shift kemarin, dan laporan
// per shift tidak akan pernah cocok dengan catatan produksi.
const assert = require('assert');
const { berlakuPadaHari, shiftPada, sifatHari, setara } = require('./services/shiftCalendar');

const SHIFTS = [
  { id: 1, name: 'Shift 1', start_time: '07:00', end_time: '15:00', weekdays: [1, 2, 3, 4, 5, 6], enabled: true },
  { id: 2, name: 'Shift 2', start_time: '15:00', end_time: '23:00', weekdays: [1, 2, 3, 4, 5, 6], enabled: true },
  { id: 3, name: 'Shift 3', start_time: '23:00', end_time: '07:00', weekdays: [1, 2, 3, 4, 5, 6], enabled: true },
];

// 24 Sep 2026 adalah hari Kamis.
const kamis = (h, m) => new Date(2026, 8, 24, h, m || 0);
const jumat = (h, m) => new Date(2026, 8, 25, h, m || 0);
const minggu = (h, m) => new Date(2026, 8, 27, h, m || 0);

// ── Hari berlaku ────────────────────────────────────────────────────────────
assert.ok(berlakuPadaHari({ weekdays: [1, 2, 3, 4, 5] }, 3), 'Rabu termasuk');
assert.ok(!berlakuPadaHari({ weekdays: [1, 2, 3, 4, 5] }, 0), 'Minggu tidak termasuk');
assert.ok(berlakuPadaHari({ weekdays: null }, 0), 'tanpa daftar berarti setiap hari');
assert.ok(berlakuPadaHari({ weekdays: [] }, 0), 'daftar kosong berarti setiap hari');

// ── Shift dalam satu hari ───────────────────────────────────────────────────
let r = shiftPada(SHIFTS, kamis(9));
assert.strictEqual(r.shift.name, 'Shift 1');
assert.strictEqual(r.tanggalShift, '2026-09-24');

r = shiftPada(SHIFTS, kamis(16));
assert.strictEqual(r.shift.name, 'Shift 2');
assert.strictEqual(r.tanggalShift, '2026-09-24');

// Batas shift: jam mulai masuk shift baru, jam selesai sudah bukan.
assert.strictEqual(shiftPada(SHIFTS, kamis(15, 0)).shift.name, 'Shift 2', 'tepat jam mulai masuk shift baru');
assert.strictEqual(shiftPada(SHIFTS, kamis(14, 59)).shift.name, 'Shift 1', 'semenit sebelumnya masih shift lama');

// ── Shift malam melewati tengah malam ───────────────────────────────────────
r = shiftPada(SHIFTS, kamis(23, 30));
assert.strictEqual(r.shift.name, 'Shift 3');
assert.strictEqual(r.tanggalShift, '2026-09-24', 'sebelum tengah malam milik hari itu');

r = shiftPada(SHIFTS, jumat(2, 0));
assert.strictEqual(r.shift.name, 'Shift 3');
assert.strictEqual(r.tanggalShift, '2026-09-24',
  'jam 02:00 Jumat masih milik shift yang dimulai Kamis malam');

r = shiftPada(SHIFTS, jumat(6, 59));
assert.strictEqual(r.tanggalShift, '2026-09-24', 'sampai sebelum 07:00 masih shift kemarin');

r = shiftPada(SHIFTS, jumat(7, 0));
assert.strictEqual(r.shift.name, 'Shift 1');
assert.strictEqual(r.tanggalShift, '2026-09-25', 'jam 07:00 sudah shift hari baru');

// ── Hari yang tidak berlaku ─────────────────────────────────────────────────
assert.strictEqual(shiftPada(SHIFTS, minggu(9)), null, 'Minggu tidak ada shift');
// Tapi shift malam yang dimulai Sabtu tetap berlanjut ke Minggu pagi.
r = shiftPada(SHIFTS, minggu(3));
assert.ok(r, 'Minggu dini hari masih shift Sabtu malam');
assert.strictEqual(r.tanggalShift, '2026-09-26');

// Shift nonaktif dilewati.
const NONAKTIF = SHIFTS.map((s) => ({ ...s, enabled: false }));
assert.strictEqual(shiftPada(NONAKTIF, kamis(9)), null, 'seluruh shift nonaktif');

// ── Sifat hari ──────────────────────────────────────────────────────────────
assert.strictEqual(sifatHari('2026-09-24', {}), 'production', 'Kamis biasa');
assert.strictEqual(sifatHari('2026-09-27', {}), 'holiday', 'Minggu libur');
assert.strictEqual(sifatHari('2026-09-24', { '2026-09-24': 'shutdown' }), 'shutdown', 'penanda khusus menang');
assert.strictEqual(sifatHari('2026-09-27', { '2026-09-27': 'production' }), 'production',
  'Minggu bisa ditandai sebagai hari kerja');

assert.ok(setara('2026-09-24', '2026-09-23', {}), 'dua hari kerja setara');
assert.ok(!setara('2026-09-24', '2026-09-27', {}), 'hari kerja tidak setara dengan libur');
assert.ok(setara('2026-09-24', '2026-09-27', { '2026-09-27': 'production' }),
  'Minggu yang ditandai kerja setara dengan hari kerja');

console.log('PASS — kalender shift');
