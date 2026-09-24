// Mesin alarm: menyambungkan aturan di database dengan data realtime.
//
// Sengaja berjalan di timer sendiri, bukan menempel di jalur pembacaan Modbus.
// Alasannya: satu aturan yang lambat atau satu pengiriman email yang menggantung
// tidak boleh memperlambat polling bus RS485. Kalau polling melambat, seluruh
// data ikut terlambat — harga yang jauh lebih mahal daripada alarm yang telat
// beberapa detik.
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { getLatestData, broadcastAlarm } = require('../websocket/wsServer');
const { evaluasi, isiTemplate } = require('./alarmRules');
const { sendAlarmEmail } = require('./emailService');

const TICK_MS = parseInt(process.env.ALARM_TICK_MS) || 5000;
const RELOAD_MS = 60000;

let timer = null;
let rules = [];
let templates = {};
let lastLoad = 0;
let perluMuatUlang = true;   // permintaan muat ulang, terpisah dari penanda waktu
const state = {};        // per rule id: { melanggarSejak, menyala }
const eventAktif = {};   // per rule id: id baris alarm_events yang masih menyala

async function muatAturan() {
  rules = await sequelize.query(`
    SELECT r.*, d.name AS device_name, a.name AS node_name
      FROM alarm_rules r
      LEFT JOIN devices d ON d.id = r.device_id
      LEFT JOIN asset_nodes a ON a.id = r.asset_node_id
     WHERE r.enabled = true`, { type: QueryTypes.SELECT });

  const t = await sequelize.query('SELECT name, subject, body FROM email_templates',
    { type: QueryTypes.SELECT });
  templates = {};
  t.forEach((x) => { templates[x.name] = x; });
  lastLoad = Date.now();
  perluMuatUlang = false;
}

// Device mana yang dipantau aturan ini. Aturan bertingkat node memantau seluruh
// device di cabangnya.
async function deviceUntuk(rule) {
  if (rule.device_id) return [rule.device_id];
  const rows = await sequelize.query(`
    WITH RECURSIVE cabang AS (
      SELECT id FROM asset_nodes WHERE id = :node
      UNION ALL
      SELECT a.id FROM asset_nodes a JOIN cabang c ON a.parent_id = c.id
    )
    SELECT d.id FROM devices d WHERE d.asset_node_id IN (SELECT id FROM cabang)`,
    { replacements: { node: rule.asset_node_id }, type: QueryTypes.SELECT });
  return rows.map((r) => r.id);
}

async function nyalakan(rule, deviceId, nilai) {
  const [row] = await sequelize.query(`
    INSERT INTO alarm_events (rule_id, device_id, parameter, value, threshold, severity)
    VALUES (:rule_id, :device_id, :parameter, :value, :threshold, :severity)
    RETURNING id, started_at`, {
    replacements: {
      rule_id: rule.id, device_id: deviceId, parameter: rule.parameter,
      value: Number(nilai), threshold: Number(rule.threshold), severity: rule.severity,
    }, type: QueryTypes.SELECT,
  });
  eventAktif[rule.id] = row.id;

  const pesan = {
    severity: rule.severity, rule: rule.name, device: rule.device_name || `device ${deviceId}`,
    parameter: rule.parameter, value: Number(nilai).toFixed(2), unit: '',
    operator: rule.operator, threshold: rule.threshold,
    time: new Date(row.started_at).toLocaleString('id-ID'),
    node: rule.node_name || '-',
  };

  try {
    broadcastAlarm({ type: 'alarm_rule', id: row.id, ...pesan });
  } catch (e) { /* websocket belum siap */ }

  // Email dikirim tanpa ditunggu. Kegagalan kirim tidak boleh menghentikan
  // pencatatan alarm — kejadiannya sudah tersimpan di database.
  if (rule.recipients) {
    const tpl = templates[rule.email_template] || templates.default;
    const subject = tpl ? isiTemplate(tpl.subject, pesan) : `[${rule.severity}] ${rule.name}`;
    const body = tpl ? isiTemplate(tpl.body, pesan) : JSON.stringify(pesan, null, 2);
    Promise.resolve()
      .then(() => sendAlarmEmail(rule.recipients, subject, body, pesan.device))
      .then(() => sequelize.query('UPDATE alarm_events SET notified = true WHERE id = :id',
        { replacements: { id: row.id } }))
      .catch((e) => console.error(`[Alarm] gagal kirim email aturan ${rule.id}: ${e.message}`));
  }

  console.log(`[Alarm] NYALA #${row.id} ${rule.name}: ${rule.parameter} = ${pesan.value}`);
}

async function padamkan(rule) {
  const id = eventAktif[rule.id];
  if (!id) return;
  delete eventAktif[rule.id];
  await sequelize.query('UPDATE alarm_events SET cleared_at = now() WHERE id = :id AND cleared_at IS NULL',
    { replacements: { id } });
  try {
    broadcastAlarm({ type: 'alarm_rule_clear', id, rule: rule.name });
  } catch (e) { /* abaikan */ }
  console.log(`[Alarm] PADAM #${id} ${rule.name}`);
}

async function tick() {
  try {
    if (perluMuatUlang || Date.now() - lastLoad > RELOAD_MS) await muatAturan();
    if (rules.length === 0) return;

    const snapshot = getLatestData();
    const sekarang = new Date();

    for (const rule of rules) {
      const ids = await deviceUntuk(rule);
      // Ambil nilai pertama yang tersedia di antara device sasaran.
      let nilai = null;
      let deviceId = null;
      for (const id of ids) {
        const d = snapshot[id];
        if (d && d[rule.parameter] !== undefined && d[rule.parameter] !== null) {
          nilai = d[rule.parameter]; deviceId = id; break;
        }
      }
      if (nilai === null) continue;

      const hasil = evaluasi(rule, nilai, state[rule.id], sekarang);
      state[rule.id] = hasil.state;

      if (hasil.aksi === 'nyala') await nyalakan(rule, deviceId, nilai);
      else if (hasil.aksi === 'padam') await padamkan(rule);
    }
  } catch (err) {
    console.error(`[Alarm] tick gagal: ${err.message}`);
  }
}

async function startAlarmEngine() {
  if (timer) return;
  try { await muatAturan(); } catch (e) { console.error(`[Alarm] gagal memuat aturan: ${e.message}`); }
  timer = setInterval(tick, TICK_MS);
  console.log(`[Alarm] Mesin aturan aktif — periksa tiap ${TICK_MS / 1000} detik, ${rules.length} aturan`);
}

function stopAlarmEngine() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Dipanggil route setelah aturan berubah, supaya tidak perlu menunggu reload berkala.
//
// Memakai penanda tersendiri, bukan menimpa lastLoad. Versi sebelumnya menyetel
// lastLoad = 0, dan itu bisa dibatalkan diam-diam: startAlarmEngine bersifat async,
// jadi muatAturan() di dalamnya dapat selesai SETELAH sebuah request memanggil
// fungsi ini, lalu menimpa lastLoad kembali ke waktu sekarang. Permintaan muat
// ulangnya hilang dan aturan baru baru terdeteksi 60 detik kemudian.
function reloadRules() {
  perluMuatUlang = true;
}

module.exports = { startAlarmEngine, stopAlarmEngine, reloadRules, tick };
