// Uji circuit breaker tanpa perangkat.
const assert = require('assert');
const { create, THRESHOLD, BASE_MS, MAX_MS } = require('./services/circuitBreaker');

const b = create();
let t = 1000000;

// Dua kegagalan belum membuka breaker; yang ketiga membuka.
assert.strictEqual(b.record(7, false, t), null);
assert.strictEqual(b.record(7, false, t), null);
assert.strictEqual(THRESHOLD, 3);
assert.strictEqual(b.record(7, false, t), 'opened');
assert.strictEqual(b.allows(7, t + 1), false, 'harus dilewati selama jeda');
assert.strictEqual(b.allows(7, t + BASE_MS), true, 'jeda habis -> satu percobaan');
assert.strictEqual(b.status(t)[7].offline, true);

// Device lain tidak ikut terhalang.
assert.strictEqual(b.allows(8, t), true);

// Percobaan gagal lagi -> jeda berlipat.
t += BASE_MS;
assert.strictEqual(b.record(7, false, t), 'opened');
assert.strictEqual(b.allows(7, t + BASE_MS), false, 'jeda kedua harus 2x');
assert.strictEqual(b.allows(7, t + 2 * BASE_MS), true);

// Jeda tidak pernah melebihi MAX_MS.
for (let i = 0; i < 20; i++) { t += MAX_MS; b.record(7, false, t); }
assert.strictEqual(b.allows(7, t + MAX_MS), true, 'jeda melewati batas maksimum');

// Satu keberhasilan menutup breaker sepenuhnya.
assert.strictEqual(b.record(7, true, t + MAX_MS), 'closed');
assert.strictEqual(b.allows(7, t + MAX_MS), true);
assert.strictEqual(b.status(t)[7].offline, false);
assert.strictEqual(b.record(7, false, t), null, 'hitungan harus mulai dari nol lagi');

console.log('PASS — circuit breaker per device');
