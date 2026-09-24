// Runner migrasi minimal. Tidak ada dependensi baru.
//
//   node migrate.js          jalankan migrasi yang belum diterapkan
//   node migrate.js --status tampilkan status tanpa mengubah apa pun
//
// File migrasi ada di database/migrations, dijalankan urut nama. Yang sudah
// diterapkan dicatat di tabel schema_migrations, jadi menjalankan ulang aman.
// Setiap migrasi berjalan di dalam satu transaksi: gagal di tengah berarti
// tidak ada yang tertinggal separuh.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

const DIR = path.join(__dirname, 'database', 'migrations');
const statusOnly = process.argv.includes('--status');

(async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const rows = await sequelize.query('SELECT name FROM schema_migrations', { type: QueryTypes.SELECT });
  const applied = new Set(rows.map((r) => r.name));

  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith('.sql') || f.endsWith('.js')).sort()
    : [];

  if (statusOnly) {
    files.forEach((f) => console.log(`${applied.has(f) ? '[x]' : '[ ]'} ${f}`));
    process.exit(0);
  }

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const t = await sequelize.transaction();
    try {
      if (file.endsWith('.sql')) {
        const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
        await sequelize.query(sql, { transaction: t });
      } else {
        // Migrasi JS untuk hal yang tidak nyaman ditulis sebagai SQL, misalnya
        // memanipulasi JSONB. Mengekspor satu fungsi async (sequelize, transaction).
        const run = require(path.join(DIR, file));
        await run(sequelize, t);
      }
      await sequelize.query('INSERT INTO schema_migrations (name) VALUES (:name)', {
        replacements: { name: file }, transaction: t,
      });
      await t.commit();
      console.log(`diterapkan  ${file}`);
      count++;
    } catch (err) {
      await t.rollback();
      console.error(`GAGAL       ${file}\n            ${err.message}`);
      process.exit(1);
    }
  }

  console.log(count === 0 ? 'Tidak ada migrasi baru.' : `${count} migrasi diterapkan.`);
  process.exit(0);
})().catch((err) => { console.error(err.message); process.exit(1); });
