// Watchdog dua lapis. Ada dua hal berbeda yang bisa mati, jadi ambangnya dua.
//
//   Realtime  pembacaan Modbus sukses terakhir, ambang 2 menit.
//             Menangkap bus RS485 putus, gateway mati, meter tidak menjawab.
//   Logging   baris terakhir masuk readings, ambang 2x interval logging.
//             Menangkap cron berhenti atau database tidak bisa ditulis.
//
// Ini bukan interval penyimpanan. Data tetap disimpan tiap 15 menit.
//
// Sistem pernah kehilangan jeda 3 hari 18 jam tanpa ada yang menyadari, dan
// 21 jam data tergeser x65536 juga lolos. Lapis realtime yang membuat kejadian
// seperti itu ketahuan dalam hitungan menit, bukan saat laporan dibuat.
const { broadcastAlarm } = require('../websocket/wsServer');

const LOG_INTERVAL_MINUTES = parseInt(process.env.LOG_INTERVAL_MINUTES) || 15;
const REALTIME_TIMEOUT_MS = (parseInt(process.env.WATCHDOG_REALTIME_MINUTES) || 2) * 60000;
const LOGGING_TIMEOUT_MS = LOG_INTERVAL_MINUTES * 2 * 60000;
const CHECK_INTERVAL_MS = 30000;

const state = {
  lastRead: null,      // pembacaan Modbus sukses terakhir, per device
  lastSave: null,      // penulisan readings terakhir
  firing: {},          // alarm yang sedang aktif, supaya tidak berulang tiap 30 detik
};

function markRead(deviceId) {
  state.lastRead = state.lastRead || {};
  state.lastRead[deviceId] = Date.now();
}

function markSave() {
  state.lastSave = Date.now();
}

function raise(key, message) {
  if (state.firing[key]) return;
  state.firing[key] = true;
  console.error(`[Watchdog] ${message}`);
  try {
    broadcastAlarm({ type: 'watchdog', key, message, severity: 'high' });
  } catch (e) { /* websocket belum siap */ }
}

function clear(key, message) {
  if (!state.firing[key]) return;
  delete state.firing[key];
  console.log(`[Watchdog] pulih: ${message}`);
  try {
    broadcastAlarm({ type: 'watchdog', key, message: `Pulih: ${message}`, severity: 'info' });
  } catch (e) { /* abaikan */ }
}

function check(now = Date.now()) {
  const alerts = [];

  // Lapis realtime, per device.
  if (state.lastRead) {
    for (const [deviceId, ts] of Object.entries(state.lastRead)) {
      const idle = now - ts;
      const key = `realtime:${deviceId}`;
      if (idle > REALTIME_TIMEOUT_MS) {
        const menit = Math.round(idle / 60000);
        alerts.push({ key, message: `device ${deviceId} tidak menjawab selama ${menit} menit` });
        raise(key, `device ${deviceId} tidak menjawab selama ${menit} menit`);
      } else {
        clear(key, `device ${deviceId} kembali menjawab`);
      }
    }
  }

  // Lapis logging, global.
  if (state.lastSave) {
    const idle = now - state.lastSave;
    if (idle > LOGGING_TIMEOUT_MS) {
      const menit = Math.round(idle / 60000);
      alerts.push({ key: 'logging', message: `tidak ada data tersimpan selama ${menit} menit` });
      raise('logging', `tidak ada data tersimpan selama ${menit} menit`);
    } else {
      clear('logging', 'penyimpanan data kembali normal');
    }
  }

  return alerts;
}

let timer = null;

function startWatchdog() {
  if (timer) return;
  timer = setInterval(() => check(), CHECK_INTERVAL_MS);
  console.log(`[Watchdog] Aktif — realtime ${REALTIME_TIMEOUT_MS / 60000} menit, logging ${LOGGING_TIMEOUT_MS / 60000} menit`);
}

function stopWatchdog() {
  if (timer) clearInterval(timer);
  timer = null;
}

function status() {
  return {
    lastRead: state.lastRead,
    lastSave: state.lastSave,
    firing: Object.keys(state.firing),
    thresholds: {
      realtimeMinutes: REALTIME_TIMEOUT_MS / 60000,
      loggingMinutes: LOGGING_TIMEOUT_MS / 60000,
    },
  };
}

module.exports = { startWatchdog, stopWatchdog, markRead, markSave, check, status, state };
