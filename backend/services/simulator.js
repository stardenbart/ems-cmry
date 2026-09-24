// Nilai sintetis untuk device yang perangkatnya belum terpasang.
//
// Dipakai lewat gateway ber-protocol 'simulated'. Begitu kabel RS485/MOXA
// terpasang, gateway itu diubah jadi modbus-rtu atau modbus-tcp dari halaman
// Data Gateway dan device yang sama langsung menarik angka asli — tidak ada
// kode yang perlu disentuh, karena jalur hilirnya (broadcast, dataLogger,
// agregasi, alarm, dashboard) sama persis untuk keduanya.
//
// Tidak ada nama parameter yang disebut di sini. Bentuk kurvanya diturunkan
// dari metadata parameter, sama seperti bagian sistem yang lain.

// Nilai terakhir per device+parameter, supaya kurvanya bersambung antar siklus
// alih-alih meloncat acak tiap 3 detik.
const state = {};

// Periode drift lambat. Cukup panjang supaya kurva terlihat seperti proses yang
// bergerak, cukup pendek supaya pergerakannya kelihatan dalam satu layar.
const PERIODE_MS = 20 * 60 * 1000;

// Beda fase per parameter, supaya kanal-kanal satu perangkat tidak bergerak
// serempak seperti satu sinyal yang digandakan.
// Pengali rasio emas menyebarkan nilai hash yang berdekatan ke seluruh
// lingkaran. Tanpa itu nama pendek yang mirip ('A' dan 'B') menghasilkan fase
// yang nyaris sama, dan seluruh kanal bergerak serempak.
function fase(nama) {
  let h = 0;
  for (let i = 0; i < nama.length; i++) h = (h * 31 + nama.charCodeAt(i)) % 100000;
  const f = (h * 0.6180339887498949) % 1;
  return f * Math.PI * 2;
}

function angka(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Titik tengah dan lebar ayunan. Diambil dari blok `sim` kalau ada; kalau tidak,
// ditebak dari min/max. min/max sendiri adalah rentang SENSOR (Pt100 bisa
// -200..850 °C), jadi menebak dari situ menghasilkan ayunan yang terlalu lebar —
// karena itu `sim` layak diisi untuk kanal yang ingin terlihat realistis.
function bentuk(param) {
  const sim = param.sim || {};
  const min = angka(param.min);
  const max = angka(param.max);

  let nominal = angka(sim.nominal);
  if (nominal === null) nominal = (min !== null && max !== null) ? (min + max) / 2 : 0;

  let swing = angka(sim.swing);
  if (swing === null) {
    swing = (min !== null && max !== null)
      ? (max - min) * 0.02
      : Math.max(Math.abs(nominal) * 0.02, 0.5);
  }

  // rate = kenaikan per jam untuk parameter akumulator (agg counter).
  const rate = angka(sim.rate);
  return { nominal, swing: Math.abs(swing), rate: rate === null ? 1 : rate };
}

function bulatkan(v, precision) {
  const p = precision === undefined || precision === null ? 2 : Number(precision);
  return parseFloat(Number(v).toFixed(p));
}

// Satu nilai untuk satu parameter. `now` diterima sebagai argumen supaya bisa
// diuji tanpa menunggu waktu nyata berjalan.
function nilaiSatu(deviceId, param, now) {
  const kunci = `${deviceId}|${param.name}`;
  const { nominal, swing, rate } = bentuk(param);
  const prev = state[kunci];

  if ((param.agg || 'gauge') === 'counter') {
    // Akumulator hanya boleh naik: itu yang membuat agregasi counter (jumlah
    // selisih positif) menghasilkan angka yang benar di hilir.
    if (!prev) {
      state[kunci] = { value: Math.max(nominal, 0), at: now };
      return bulatkan(state[kunci].value, param.precision);
    }
    const jam = Math.max(0, (now - prev.at) / 3600000);
    const naik = rate * jam * (0.9 + Math.random() * 0.2);
    state[kunci] = { value: prev.value + naik, at: now };
    return bulatkan(state[kunci].value, param.precision);
  }

  const target = nominal + Math.sin(now / PERIODE_MS + fase(param.name)) * swing * 0.6;
  const dasar = prev ? prev.value : target;
  let v = dasar * 0.7 + target * 0.3 + (Math.random() - 0.5) * swing * 0.15;

  // Jangan pernah keluar dari jendela yang dijanjikan bentuk(): nilai di luar
  // min/max akan ditandai quality buruk oleh validasi, dan data dummy yang
  // menandai dirinya sendiri cacat hanya membingungkan.
  const bawah = nominal - swing;
  const atas = nominal + swing;
  if (v < bawah) v = bawah;
  if (v > atas) v = atas;

  state[kunci] = { value: v, at: now };
  return bulatkan(v, param.precision);
}

// Satu snapshot lengkap untuk satu device.
function simulateDevice(deviceId, params, now = Date.now()) {
  const out = {};
  (params || []).forEach((p) => {
    if (!p || !p.name) return;
    out[p.name] = nilaiSatu(deviceId, p, now);
  });
  return out;
}

function resetState() {
  Object.keys(state).forEach((k) => delete state[k]);
}

module.exports = { simulateDevice, resetState };
