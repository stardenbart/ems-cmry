// Periksa ulang akun mana yang masih memakai password bawaan, lalu setel
// must_change_password sesuai kenyataan. Idempoten, aman dijalankan kapan saja.
//
//   node check-default-passwords.js
//
// Dipakai setelah password diganti lewat jalur lain, supaya tandanya ikut
// tercabut dan akunnya tidak terkunci tanpa alasan.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('./config/database');
const { QueryTypes } = require('sequelize');

const DEFAULTS = {
  admin: 'admin',
  maintenance: 'maintenance',
  operator: 'operator',
  viewer: 'viewer',
};

(async () => {
  const users = await sequelize.query(
    'SELECT id, username, password, must_change_password FROM users ORDER BY username',
    { type: QueryTypes.SELECT });

  for (const u of users) {
    const def = DEFAULTS[u.username];
    let masihBawaan = false;
    if (def && u.password) {
      try { masihBawaan = await bcrypt.compare(def, u.password); } catch (e) { masihBawaan = false; }
    }

    if (masihBawaan !== u.must_change_password) {
      await sequelize.query('UPDATE users SET must_change_password = :v WHERE id = :id',
        { replacements: { v: masihBawaan, id: u.id } });
    }
    console.log(`${u.username.padEnd(24)} ${masihBawaan ? 'MASIH PASSWORD BAWAAN' : 'aman'}`);
  }

  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
