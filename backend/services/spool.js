// Penampung sementara saat database tidak bisa ditulis.
//
// Menggantikan message bus pada skala ini: tanpa broker, tanpa RAM tambahan.
// Baris ditulis sebagai JSONL, lalu diputar ulang begitu database pulih.
//
// WAJIB BERBATAS. Spool tanpa batas adalah pola yang menjatuhkan server ini pada
// 24 September 2026, waktu log pm2 tumbuh sampai 16,4 GB dan disk habis.
// Kehilangan data terlama jauh lebih baik daripada server mati, karena server
// mati berarti kehilangan semuanya justru saat datanya paling dibutuhkan.
const fs = require('fs');
const path = require('path');

const DIR = process.env.SPOOL_DIR || path.join(__dirname, '..', 'spool');
const MAX_TOTAL_BYTES = (parseInt(process.env.SPOOL_MAX_MB) || 512) * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function files() {
  ensureDir();
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).sort();
}

function totalBytes() {
  return files().reduce((sum, f) => {
    try { return sum + fs.statSync(path.join(DIR, f)).size; } catch (e) { return sum; }
  }, 0);
}

function currentFile() {
  const list = files();
  const last = list[list.length - 1];
  if (last) {
    try {
      if (fs.statSync(path.join(DIR, last)).size < MAX_FILE_BYTES) return path.join(DIR, last);
    } catch (e) { /* berkas hilang, buat baru */ }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(DIR, `spool-${stamp}.jsonl`);
}

// Buang berkas tertua sampai total kembali di bawah batas.
// Mengembalikan jumlah berkas yang dibuang, supaya pemanggil bisa menaikkan alarm.
function enforceLimit() {
  let dropped = 0;
  let list = files();
  while (totalBytes() > MAX_TOTAL_BYTES && list.length > 1) {
    const oldest = list.shift();
    try { fs.unlinkSync(path.join(DIR, oldest)); dropped++; } catch (e) { break; }
  }
  return dropped;
}

// Simpan sekumpulan record. Dipanggil hanya kalau penulisan ke database gagal.
function append(records) {
  if (!records || records.length === 0) return { written: 0, dropped: 0 };
  ensureDir();
  const line = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(currentFile(), line, 'utf8');
  const dropped = enforceLimit();
  return { written: records.length, dropped };
}

// Putar ulang seluruh isi spool memakai writeFn(records). Berkas dihapus hanya
// setelah penulisannya berhasil, jadi kegagalan di tengah tidak menghilangkan data.
async function replay(writeFn, batchSize = 500) {
  const list = files();
  let restored = 0;

  for (const name of list) {
    const full = path.join(DIR, name);
    let rows;
    try {
      rows = fs.readFileSync(full, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => { try { return JSON.parse(l); } catch (e) { return null; } })
        .filter(Boolean);
    } catch (e) {
      continue;
    }

    try {
      for (let i = 0; i < rows.length; i += batchSize) {
        await writeFn(rows.slice(i, i + batchSize));
      }
      fs.unlinkSync(full);
      restored += rows.length;
    } catch (e) {
      // Database masih bermasalah. Hentikan, coba lagi di siklus berikutnya.
      return { restored, pending: true, error: e.message };
    }
  }

  return { restored, pending: false };
}

function stats() {
  const list = files();
  return { files: list.length, bytes: totalBytes(), maxBytes: MAX_TOTAL_BYTES, dir: DIR };
}

module.exports = { append, replay, stats, enforceLimit, files, DIR, MAX_TOTAL_BYTES };
