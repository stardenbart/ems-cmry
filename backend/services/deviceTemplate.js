// Ekspor dan impor template device.
//
// Peta register satu model perangkat disimpan sebagai berkas JSON, sehingga
// menambah model meter baru menjadi pekerjaan mengimpor berkas, bukan menulis
// kode. Berguna juga untuk menyiapkan plant kedua, dan sebagai cadangan
// konfigurasi yang terpisah dari cadangan data.

const FORMAT = 'ems-device-template';
const VERSION = 1;

// Field yang boleh ada pada sebuah parameter. Apa pun di luar ini dibuang saat
// impor, supaya berkas dari luar tidak bisa menyelipkan isian tak dikenal.
const FIELD = [
  'name', 'address', 'length', 'dataType', 'save',
  'kind', 'unit', 'agg', 'precision',
  'conv_mode', 'scale', 'offset',
  'min', 'max', 'featured', 'order', 'poll_class',
];

const DATA_TYPE = ['float32be', 'float32', 'int16', 'uint16', 'int32', 'int64-be'];
const AGG = ['counter', 'gauge'];
const POLL_CLASS = ['fast', 'normal', 'slow'];

function toExport(deviceType) {
  const params = typeof deviceType.params === 'string'
    ? JSON.parse(deviceType.params)
    : (deviceType.params || []);

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    name: deviceType.name,
    category: deviceType.category || 'Power Meter',
    params: params.map((p) => {
      const out = {};
      FIELD.forEach((f) => { if (p[f] !== undefined) out[f] = p[f]; });
      return out;
    }),
  };
}

// Kembalikan { ok, errors, value }. Impor tidak pernah menerima berkas separuh
// benar: kalau ada satu parameter yang tidak sah, seluruh berkas ditolak.
function validateImport(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['berkas bukan objek JSON'] };
  if (raw.format !== FORMAT) errors.push(`format harus "${FORMAT}"`);
  if (Number(raw.version) !== VERSION) errors.push(`versi tidak didukung: ${raw.version}`);
  if (!raw.name || typeof raw.name !== 'string') errors.push('name diperlukan');
  if (!Array.isArray(raw.params) || raw.params.length === 0) errors.push('params kosong');

  const bersih = [];
  if (Array.isArray(raw.params)) {
    const namaTerpakai = new Set();

    raw.params.forEach((p, i) => {
      const label = `params[${i}]`;
      if (!p || typeof p !== 'object') { errors.push(`${label} bukan objek`); return; }
      if (!p.name) { errors.push(`${label}.name diperlukan`); return; }
      if (namaTerpakai.has(p.name)) { errors.push(`${label}.name ganda: ${p.name}`); return; }
      namaTerpakai.add(p.name);

      const address = Number(p.address);
      if (!Number.isInteger(address) || address < 0 || address > 65535) {
        errors.push(`${label}.address tidak sah: ${p.address}`);
      }
      const length = Number(p.length === undefined ? 2 : p.length);
      if (!Number.isInteger(length) || length < 1 || length > 125) {
        errors.push(`${label}.length harus 1..125`);
      }
      if (p.dataType && !DATA_TYPE.includes(String(p.dataType).toLowerCase())) {
        errors.push(`${label}.dataType tidak dikenal: ${p.dataType}`);
      }
      if (p.agg && !AGG.includes(p.agg)) {
        errors.push(`${label}.agg harus counter atau gauge`);
      }
      if (p.poll_class && !POLL_CLASS.includes(p.poll_class)) {
        errors.push(`${label}.poll_class harus fast, normal, atau slow`);
      }
      if (p.min !== undefined && p.max !== undefined &&
          p.min !== null && p.max !== null && Number(p.min) > Number(p.max)) {
        errors.push(`${label}.min melebihi max`);
      }

      const out = {};
      FIELD.forEach((f) => { if (p[f] !== undefined) out[f] = p[f]; });
      out.address = address;
      out.length = length;
      if (out.save === undefined) out.save = true;
      bersih.push(out);
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      name: raw.name,
      category: raw.category || 'Power Meter',
      params: bersih,
    },
  };
}

module.exports = { toExport, validateImport, FORMAT, VERSION, FIELD };
