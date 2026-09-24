// Backup harian ems_db dengan pg_dump, dijalankan Task Scheduler Windows.
//
//   node scripts/backup.js            buat satu dump, lalu hapus yang lewat masa simpan
//
// Kredensial dibaca dari backend/.env dan tidak pernah dicetak. Folder, jumlah
// hari simpan, dan lokasi pg_dump bisa diatur lewat .env:
//   BACKUP_DIR=C:/Apps/backup  BACKUP_KEEP_DAYS=14
//   PG_DUMP=C:/Program Files/PostgreSQL/17/bin/pg_dump.exe
//
// RPO = 24 jam: kalau disk server rusak, paling banyak satu hari data hilang.
// Dump disimpan di disk yang SAMA dengan database, jadi ini melindungi dari
// kesalahan manusia dan migrasi gagal, bukan dari kerusakan disk. Salin folder
// backup ke lokasi lain kalau itu juga perlu dilindungi.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { spawnSync } = require('child_process');
const fs = require('fs');

const DIR = process.env.BACKUP_DIR || 'C:/Apps/backup';
const KEEP_DAYS = parseInt(process.env.BACKUP_KEEP_DAYS, 10) || 14;
const PG_DUMP = process.env.PG_DUMP || 'C:/Program Files/PostgreSQL/17/bin/pg_dump.exe';

function log(msg) {
  const baris = `${new Date().toISOString()} ${msg}`;
  console.log(baris);
  try { fs.appendFileSync(path.join(DIR, 'backup.log'), baris + '\n'); } catch (e) {}
}

fs.mkdirSync(DIR, { recursive: true });

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const out = path.join(DIR, `ems_db_${stamp}.sql`);

const r = spawnSync(PG_DUMP,
  ['-h', process.env.DB_HOST, '-p', String(process.env.DB_PORT || 5432),
   '-U', process.env.DB_USER, '-d', process.env.DB_NAME, '-f', out],
  { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }, encoding: 'utf8' });

if (r.status !== 0) {
  log(`GAGAL status=${r.status} ${r.error ? r.error.message : ''} ${(r.stderr || '').trim()}`);
  // Dump separuh jadi lebih berbahaya daripada tidak ada: bisa dikira utuh.
  try { fs.unlinkSync(out); } catch (e) {}
  process.exit(1);
}

const ukuran = fs.statSync(out).size;
// Dump yang terlalu kecil hampir pasti gagal diam-diam (misalnya database kosong
// karena salah nama). Jangan pakai itu sebagai alasan menghapus dump lama.
if (ukuran < 100 * 1024) {
  log(`PERINGATAN dump hanya ${ukuran} byte — dump lama TIDAK dihapus`);
  process.exit(1);
}
log(`OK ${out} (${Math.round(ukuran / 1024)} KB)`);

// Hapus dump harian yang lebih tua dari masa simpan. Hanya berkas berpola
// ems_db_*.sql yang disentuh; folder pre-* dan berkas lain dibiarkan.
const batas = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
let dihapus = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!/^ems_db_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.sql$/.test(f)) continue;
  const full = path.join(DIR, f);
  if (full === out) continue;
  if (fs.statSync(full).mtimeMs < batas) { fs.unlinkSync(full); dihapus++; }
}
if (dihapus) log(`dihapus ${dihapus} dump lebih tua dari ${KEEP_DAYS} hari`);
