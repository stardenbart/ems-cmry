// Uji simulator tanpa database maupun perangkat.
const assert = require('assert');
const { simulateDevice, resetState } = require('./services/simulator');

const SUHU = [
  { name: 'TT02', kind: 'temperature', unit: 'degC', agg: 'gauge', precision: 1,
    min: -200, max: 850, sim: { nominal: 37.9, swing: 2.5 } },
  { name: 'TT09', kind: 'temperature', unit: 'degC', agg: 'gauge', precision: 1,
    min: -200, max: 850, sim: { nominal: 44.6, swing: 2.5 } },
];

resetState();

// 1. Nilai tidak pernah keluar dari jendela nominal +- swing. Kalau keluar,
//    validasi rentang akan menandainya quality buruk dan data dummy jadi
//    terlihat cacat padahal sistemnya sehat.
let t = Date.now();
let sebelum = null;
for (let i = 0; i < 500; i++) {
  const d = simulateDevice(1, SUHU, t + i * 3000);
  assert.ok(d.TT02 >= 35.4 && d.TT02 <= 40.4, `TT02 keluar jendela: ${d.TT02}`);
  assert.ok(d.TT09 >= 42.1 && d.TT09 <= 47.1, `TT09 keluar jendela: ${d.TT09}`);
  // 2. Kurvanya bersambung, bukan loncatan acak tiap siklus.
  if (sebelum !== null) {
    assert.ok(Math.abs(d.TT02 - sebelum) < 1.0, `TT02 meloncat ${sebelum} -> ${d.TT02}`);
  }
  sebelum = d.TT02;
}

// 3. Kanal berbeda tidak bergerak serempak.
resetState();
const sama = [
  { name: 'A', agg: 'gauge', precision: 3, sim: { nominal: 40, swing: 3 } },
  { name: 'B', agg: 'gauge', precision: 3, sim: { nominal: 40, swing: 3 } },
];
let beda = 0;
for (let i = 0; i < 200; i++) {
  const d = simulateDevice(2, sama, t + i * 3000);
  if (Math.abs(d.A - d.B) > 0.3) beda++;
}
assert.ok(beda > 100, `kanal terlalu mirip, hanya ${beda}/200 yang berbeda`);

// 4. Akumulator hanya naik, dan lajunya sesuai sim.rate per jam.
resetState();
const METER = [{ name: 'Energy', agg: 'counter', precision: 2, sim: { nominal: 1000, rate: 120 } }];
let last = -Infinity;
for (let i = 0; i <= 10; i++) {
  const v = simulateDevice(3, METER, t + i * 3600000).Energy;
  assert.ok(v >= last, `akumulator turun: ${last} -> ${v}`);
  last = v;
}
// 10 jam x 120/jam = 1200, plus jitter +-10%
assert.ok(last > 1000 + 1080 && last < 1000 + 1320, `laju akumulator meleset: ${last}`);

// 5. Tanpa blok sim sekalipun tetap menghasilkan angka, diturunkan dari min/max.
resetState();
const POLOS = [{ name: 'P', agg: 'gauge', precision: 2, min: 0, max: 100 }];
const v = simulateDevice(4, POLOS, t).P;
assert.ok(v > 45 && v < 55, `default min/max meleset: ${v}`);

console.log('test-simulator: semua lolos');
