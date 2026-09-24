// Cek katalog kapabilitas dan pewarisan hak akses di pohon aset. Tanpa database.
//   node test-capabilities.js
//
// Yang dijaga: peran yang diberikan pada sebuah node berlaku ke SELURUH cabang di
// bawahnya, dan tidak bocor ke cabang sebelah. Kalau pewarisannya salah arah,
// operator Gedung A bisa melihat Gedung B tanpa ada yang menyadari.
const assert = require('assert');
const { KATALOG, valid, saring, berlakuDiNode, boleh, semuaKapabilitas } = require('./services/capabilities');

// Pohon: 1 Plant -> 2 CMD 1 -> 4 Serac Line 1 -> 6 Filler
//                -> 3 CMD 2 -> 5 Line lain
const INDUK = { 2: 1, 3: 1, 4: 2, 5: 3, 6: 4 };

// ── Katalog ─────────────────────────────────────────────────────────────────
assert.ok(KATALOG.length > 0, 'katalog tidak boleh kosong');
assert.ok(valid('mapping.manage'), 'kapabilitas nyata dikenali');
assert.ok(!valid('mapping.hapus_semua'), 'kapabilitas karangan ditolak');
assert.deepStrictEqual(saring(['device.view', 'sihir', 'alarm.ack']), ['device.view', 'alarm.ack'],
  'kunci di luar katalog dibuang');
assert.deepStrictEqual(saring(['device.view', 'device.view']), ['device.view'], 'duplikat dibuang');
assert.deepStrictEqual(saring(null), [], 'null aman');

// Tidak ada kunci ganda di katalog.
assert.strictEqual(new Set(KATALOG.map((c) => c.key)).size, KATALOG.length, 'kunci katalog harus unik');

// ── Pewarisan di pohon ──────────────────────────────────────────────────────
assert.ok(berlakuDiNode(null, 6, INDUK), 'penugasan tanpa node berlaku di mana saja');
assert.ok(berlakuDiNode(2, 2, INDUK), 'node itu sendiri');
assert.ok(berlakuDiNode(2, 4, INDUK), 'anak');
assert.ok(berlakuDiNode(2, 6, INDUK), 'cucu');
assert.ok(!berlakuDiNode(2, 3, INDUK), 'cabang sebelah tidak ikut');
assert.ok(!berlakuDiNode(2, 5, INDUK), 'anak cabang sebelah tidak ikut');
assert.ok(!berlakuDiNode(4, 2, INDUK), 'pewarisan tidak boleh naik ke induk');
assert.ok(!berlakuDiNode(2, null, INDUK), 'penugasan bernode tidak berlaku tanpa node');

// Pohon yang rusak berputar tidak boleh membuat gantung.
assert.ok(!berlakuDiNode(99, 2, { 1: 2, 2: 1 }), 'siklus induk tidak menggantung');

// ── Pemeriksaan hak ─────────────────────────────────────────────────────────
const OPERATOR_CMD1 = [{ capabilities: ['dashboard.view', 'alarm.ack'], asset_node_id: 2 }];
assert.ok(boleh(OPERATOR_CMD1, 'alarm.ack', 4, INDUK), 'boleh di line dalam CMD 1');
assert.ok(!boleh(OPERATOR_CMD1, 'alarm.ack', 5, INDUK), 'tidak boleh di CMD 2');
assert.ok(!boleh(OPERATOR_CMD1, 'mapping.manage', 4, INDUK), 'kapabilitas yang tidak dimiliki');
assert.ok(!boleh(OPERATOR_CMD1, 'kapabilitas.palsu', 4, INDUK), 'kapabilitas karangan selalu ditolak');

const ADMIN = [{ capabilities: ['user.manage'], asset_node_id: null }];
assert.ok(boleh(ADMIN, 'user.manage', 6, INDUK), 'penugasan global berlaku di mana saja');
assert.ok(boleh(ADMIN, 'user.manage', null, INDUK), 'juga tanpa node');

// Beberapa penugasan sekaligus.
const GANDA = [
  { capabilities: ['alarm.ack'], asset_node_id: 2 },
  { capabilities: ['dashboard.view'], asset_node_id: 3 },
];
assert.ok(boleh(GANDA, 'alarm.ack', 6, INDUK), 'penugasan pertama');
assert.ok(boleh(GANDA, 'dashboard.view', 5, INDUK), 'penugasan kedua');
assert.ok(!boleh(GANDA, 'alarm.ack', 5, INDUK), 'tidak tercampur antar penugasan');

assert.deepStrictEqual(semuaKapabilitas(GANDA).sort(), ['alarm.ack', 'dashboard.view']);
assert.deepStrictEqual(semuaKapabilitas([]), [], 'tanpa penugasan');

console.log('PASS — katalog kapabilitas dan pewarisan hak akses');
