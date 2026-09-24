// Cek pengelompokan register jadi blok. Tidak butuh database maupun perangkat.
//   node test-blocks.js
//
// Yang dijaga: offset setiap parameter di dalam bloknya harus tepat. Kalau
// offset meleset satu register, hasilnya persis seperti bug x65536 — angkanya
// tetap terlihat wajar tapi salah.
const assert = require('assert');
const { buildBlocks, dueAtCycle, savings } = require('./services/modbusBlocks');

// Peta register PM2200 yang terpasang di produksi.
const PM2200 = [
  { name: 'Current A',        address: 2999,  length: 2, poll_class: 'normal' },
  { name: 'Current B',        address: 3001,  length: 2, poll_class: 'normal' },
  { name: 'Current C',        address: 3003,  length: 2, poll_class: 'normal' },
  { name: 'Current N',        address: 3005,  length: 2, poll_class: 'normal' },
  { name: 'Current Avg',      address: 3009,  length: 2, poll_class: 'normal' },
  { name: 'Voltage A-B',      address: 3019,  length: 2, poll_class: 'normal' },
  { name: 'Voltage L-L Avg',  address: 3025,  length: 2, poll_class: 'normal' },
  { name: 'Active Power Total', address: 3059, length: 2, poll_class: 'fast' },
  { name: 'Frequency',        address: 3109,  length: 2, poll_class: 'normal' },
  { name: 'Energy Into Load', address: 3203,  length: 4, poll_class: 'slow' },
  { name: 'THD Current A',    address: 21299, length: 2, poll_class: 'slow' },
];

const blocks = buildBlocks(PM2200);

// Setiap parameter harus muncul tepat sekali.
const seen = blocks.flatMap((b) => b.params.map((x) => x.param.name));
assert.strictEqual(seen.length, PM2200.length, 'jumlah parameter tidak berubah');
assert.strictEqual(new Set(seen).size, PM2200.length, 'tidak ada parameter ganda');

// Offset harus tepat: start blok + offset = alamat asli parameter.
for (const b of blocks) {
  for (const { param, offset } of b.params) {
    assert.strictEqual(b.start + offset, Number(param.address),
      `offset salah untuk ${param.name}: ${b.start} + ${offset} != ${param.address}`);
    assert.ok(offset + Number(param.length) <= b.length,
      `${param.name} melewati batas blok`);
  }
}

// Tidak boleh ada blok yang melanggar batas protokol.
blocks.forEach((b) => assert.ok(b.length <= 125, `blok ${b.start} terlalu panjang: ${b.length}`));

// Kelas berbeda tidak boleh bercampur dalam satu blok.
blocks.forEach((b) => {
  const kelas = new Set(b.params.map((x) => x.param.poll_class || 'normal'));
  assert.strictEqual(kelas.size, 1, `blok ${b.start} mencampur kelas: ${[...kelas]}`);
});

// Harus benar-benar menghemat permintaan.
const s = savings(PM2200);
assert.ok(s.after < s.before, `tidak menghemat: ${s.before} -> ${s.after}`);
assert.ok(s.after <= 6, `terlalu banyak blok: ${s.after}`);

// Alamat yang berjauhan tidak boleh digabung.
const jauh = buildBlocks([
  { name: 'A', address: 3000, length: 2, poll_class: 'normal' },
  { name: 'B', address: 21299, length: 2, poll_class: 'normal' },
]);
assert.strictEqual(jauh.length, 2, 'alamat berjauhan harus jadi dua blok');

// Kelas laju: fast tiap siklus, normal tiap 2, slow tiap 10.
assert.ok(dueAtCycle({ pollClass: 'fast' }, 1), 'fast dibaca tiap siklus');
assert.ok(dueAtCycle({ pollClass: 'normal' }, 4), 'normal dibaca di siklus genap');
assert.ok(!dueAtCycle({ pollClass: 'normal' }, 5), 'normal dilewati di siklus ganjil');
assert.ok(dueAtCycle({ pollClass: 'slow' }, 20), 'slow dibaca tiap 10 siklus');
assert.ok(!dueAtCycle({ pollClass: 'slow' }, 21), 'slow dilewati di antaranya');

// Input kosong dan tidak valid tidak boleh membuat crash.
assert.deepStrictEqual(buildBlocks([]), [], 'daftar kosong');
assert.deepStrictEqual(buildBlocks(null), [], 'null aman');
assert.deepStrictEqual(buildBlocks([{ name: 'X' }]), [], 'parameter tanpa alamat dilewati');

console.log(`PASS — blok: ${s.before} permintaan jadi ${s.after}`);
