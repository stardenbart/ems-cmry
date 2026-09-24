// Paksa ganti password untuk akun yang masih memakai password bawaan.
//
// Server produksi masih menerima admin/admin sampai 24 September 2026. Migrasi
// ini menandai akun yang password-nya masih sama dengan bawaan seed, sehingga
// pemiliknya wajib menggantinya saat login berikutnya.
//
// Pengecekan memakai bcrypt.compare, bukan menebak dari nama user, supaya akun
// yang passwordnya sudah diganti tidak ikut terkena.
const bcrypt = require('bcryptjs');
const { QueryTypes } = require('sequelize');

// Password bawaan dari seed.js
const DEFAULTS = {
  admin: 'admin',
  maintenance: 'maintenance',
  operator: 'operator',
  viewer: 'viewer',
};

module.exports = async function run(sequelize, transaction) {
  await sequelize.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false`,
    { transaction });

  const users = await sequelize.query('SELECT id, username, password FROM users', {
    type: QueryTypes.SELECT, transaction,
  });

  let flagged = 0;
  for (const u of users) {
    const def = DEFAULTS[u.username];
    if (!def || !u.password) continue;

    let masihBawaan = false;
    try {
      masihBawaan = await bcrypt.compare(def, u.password);
    } catch (e) {
      masihBawaan = false;
    }

    if (masihBawaan) {
      await sequelize.query(
        'UPDATE users SET must_change_password = true WHERE id = :id',
        { replacements: { id: u.id }, transaction });
      flagged++;
    }
  }

  console.log(`            ${flagged} akun masih memakai password bawaan dan wajib menggantinya`);
};
