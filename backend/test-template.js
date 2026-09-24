// Cek ekspor dan impor template device. Tanpa database.
//   node test-template.js
//
// Yang dijaga: berkas dari luar tidak boleh menyelipkan isian tak dikenal, dan
// berkas yang separuh salah harus ditolak seluruhnya — bukan diterima sebagian,
// yang akan menghasilkan peta register bolong tanpa ada yang sadar.
const assert = require('assert');
const { toExport, validateImport, FORMAT, VERSION } = require('./services/deviceTemplate');

const PM2200 = {
  name: 'PM2200',
  category: 'Power Meter',
  params: [
    { name: 'Active Power Total', address: 3059, length: 2, dataType: 'float32be', save: true,
      kind: 'power', unit: 'kW', agg: 'gauge', poll_class: 'fast', min: -5000, max: 5000,
      featured: true, order: 0, precision: 2, conv_mode: 'none', scale: 1, offset: 0 },
    { name: 'Energi', address: 3203, length: 4, dataType: 'int64-be', save: true,
      kind: 'energy', unit: 'Wh', agg: 'counter', poll_class: 'slow' },
  ],
};

// ── Ekspor ──────────────────────────────────────────────────────────────────
const ekspor = toExport(PM2200);
assert.strictEqual(ekspor.format, FORMAT);
assert.strictEqual(ekspor.version, VERSION);
assert.strictEqual(ekspor.params.length, 2);
assert.strictEqual(ekspor.params[0].unit, 'kW', 'metadata ikut terbawa');
assert.strictEqual(ekspor.params[1].agg, 'counter');

// params berupa string JSON juga harus tertangani.
assert.strictEqual(toExport({ name: 'X', params: JSON.stringify(PM2200.params) }).params.length, 2);

// ── Impor: pulang pergi ─────────────────────────────────────────────────────
const balik = validateImport(ekspor);
assert.ok(balik.ok, 'hasil ekspor harus bisa diimpor lagi: ' + balik.errors);
assert.strictEqual(balik.value.params.length, 2);
assert.strictEqual(balik.value.params[0].address, 3059);
assert.strictEqual(balik.value.params[1].length, 4);

// ── Impor: yang harus ditolak ───────────────────────────────────────────────
const tolak = (obj, alasan) => {
  const r = validateImport(obj);
  assert.ok(!r.ok, 'seharusnya ditolak: ' + alasan);
  return r.errors;
};

tolak(null, 'bukan objek');
tolak({ ...ekspor, format: 'lain' }, 'format asing');
tolak({ ...ekspor, version: 99 }, 'versi tidak didukung');
tolak({ ...ekspor, params: [] }, 'params kosong');
tolak({ ...ekspor, params: [{ address: 1 }] }, 'name hilang');
tolak({ ...ekspor, params: [{ name: 'A', address: 99999 }] }, 'address di luar 16 bit');
tolak({ ...ekspor, params: [{ name: 'A', address: 10, length: 200 }] }, 'length melebihi batas Modbus');
tolak({ ...ekspor, params: [{ name: 'A', address: 10, dataType: 'float64' }] }, 'dataType tidak dikenal');
tolak({ ...ekspor, params: [{ name: 'A', address: 10, agg: 'jumlah' }] }, 'agg tidak dikenal');
tolak({ ...ekspor, params: [{ name: 'A', address: 10, poll_class: 'kilat' }] }, 'poll_class tidak dikenal');
tolak({ ...ekspor, params: [{ name: 'A', address: 10, min: 100, max: 1 }] }, 'min melebihi max');
tolak({ ...ekspor, params: [{ name: 'A', address: 1 }, { name: 'A', address: 2 }] }, 'nama ganda');

// Satu parameter salah membatalkan seluruh berkas, bukan diterima sebagian.
const campur = validateImport({ ...ekspor, params: [ekspor.params[0], { name: 'B', address: -5 }] });
assert.ok(!campur.ok, 'berkas separuh salah harus ditolak seluruhnya');

// ── Isian tak dikenal dibuang ───────────────────────────────────────────────
const nakal = validateImport({
  ...ekspor,
  params: [{ name: 'A', address: 10, length: 2, jahat: 'rm -rf', __proto__: { x: 1 } }],
});
assert.ok(nakal.ok, 'parameter sah tetap diterima');
assert.strictEqual(nakal.value.params[0].jahat, undefined, 'isian tak dikenal harus dibuang');
assert.strictEqual(nakal.value.params[0].save, true, 'save default true');

console.log('PASS — ekspor dan impor template device');
