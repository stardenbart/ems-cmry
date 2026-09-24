// Pencatat perubahan konfigurasi.
//
// Sengaja tidak pernah melempar error: kegagalan mencatat audit tidak boleh
// menggagalkan perubahan yang diminta user. Kalau gagal, cukup dicatat di log.
const sequelize = require('../config/database');

function actor(req) {
  const u = (req && req.user) || {};
  return {
    user_id: u.id || null,
    username: u.username || null,
    ip: (req && (req.headers['x-forwarded-for'] || req.socket?.remoteAddress)) || null,
  };
}

async function record(req, { action, entity, entityId, before, after }) {
  try {
    const a = actor(req);
    await sequelize.query(`
      INSERT INTO audit_log (user_id, username, action, entity, entity_id, before_val, after_val, ip)
      VALUES (:user_id, :username, :action, :entity, :entity_id, :before_val, :after_val, :ip)`, {
      replacements: {
        ...a,
        action,
        entity,
        entity_id: entityId === undefined || entityId === null ? null : String(entityId),
        before_val: before === undefined ? null : JSON.stringify(before),
        after_val: after === undefined ? null : JSON.stringify(after),
      },
    });
  } catch (err) {
    console.error(`[Audit] gagal mencatat ${entity}.${action}: ${err.message}`);
  }
}

module.exports = { record };
