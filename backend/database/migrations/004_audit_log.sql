-- Catatan perubahan konfigurasi.
--
-- Pada 22 September 2026 ada yang mengubah alamat register lewat Settings dan
-- sistem menyimpan angka salah selama dua hari. Tidak ada cara mengetahui siapa,
-- kapan, dan dari nilai apa ke nilai apa. Tabel ini menutup lubang itu.
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id    INTEGER,
  username   VARCHAR(50),
  action     VARCHAR(20) NOT NULL,
  entity     VARCHAR(50) NOT NULL,
  entity_id  VARCHAR(50),
  before_val JSONB,
  after_val  JSONB,
  ip         VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_audit_at     ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);

COMMENT ON COLUMN audit_log.action IS 'create | update | delete';
COMMENT ON COLUMN audit_log.entity IS 'device_type | device | gateway | unit | user';
