// Circuit breaker per device.
//
// Satu bus RS485 dipakai bergantian oleh semua device di gateway yang sama.
// Device yang tidak menjawab menghabiskan timeout 3 detik per blok, lalu
// memaksa reconnect gateway — dan itu memperlambat device sehat di bus yang
// sama. Setelah THRESHOLD kegagalan berturut-turut, device dilewati untuk
// sementara, dengan jeda yang memanjang sampai MAX_MS, lalu dicoba lagi.
//
// Murni, tanpa I/O: waktu diterima sebagai argumen supaya bisa diuji.

const THRESHOLD = 3;
const BASE_MS = 30 * 1000;
const MAX_MS = 5 * 60 * 1000;

function create() {
  const state = {}; // id -> { fails, openUntil, trips }

  function get(id) {
    return state[id] || (state[id] = { fails: 0, openUntil: 0, trips: 0 });
  }

  // Boleh dipoll sekarang? Saat jeda habis, satu percobaan dibiarkan lewat
  // (half-open); hasilnya menentukan breaker menutup atau membuka lagi.
  function allows(id, now) {
    return now >= get(id).openUntil;
  }

  // Mengembalikan 'opened' | 'closed' | null, untuk dicatat di log.
  function record(id, ok, now) {
    const s = get(id);
    if (ok) {
      const wasOpen = s.trips > 0;
      s.fails = 0; s.openUntil = 0; s.trips = 0;
      return wasOpen ? 'closed' : null;
    }
    s.fails++;
    if (s.fails < THRESHOLD) return null;
    // Jeda berlipat tiap kali breaker membuka lagi: 30 s, 60 s, 120 s, ... 5 menit.
    const jeda = Math.min(BASE_MS * Math.pow(2, s.trips), MAX_MS);
    s.trips++;
    s.openUntil = now + jeda;
    return 'opened';
  }

  function status(now) {
    const out = {};
    Object.entries(state).forEach(([id, s]) => {
      out[id] = {
        offline: s.trips > 0,
        consecutiveFailures: s.fails,
        retryInSeconds: s.openUntil > now ? Math.round((s.openUntil - now) / 1000) : 0,
      };
    });
    return out;
  }

  function reset(id) { delete state[id]; }

  return { allows, record, status, reset };
}

module.exports = { create, THRESHOLD, BASE_MS, MAX_MS };
