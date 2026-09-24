-- Identitas parameter yang stabil.
--
-- readings memakai kolom teks `parameter` sebagai kunci. Begitu user bisa
-- mengganti nama parameter dari UI, mengubah "PF Total" jadi "Power Factor A"
-- akan memutus riwayat. Itu bukan skenario hipotetis: persis masalah ini muncul
-- 24 September 2026 dan diakali dengan mempertahankan nama lama.
--
-- Migrasi ini ADITIF. Kolom teks tetap ada dan tetap dipakai seluruh query,
-- sehingga tidak ada perilaku yang berubah. Yang disiapkan adalah identitas
-- numeriknya, supaya perpindahan query ke parameter_id bisa dilakukan terpisah
-- dan bisa diuji sendiri.
CREATE TABLE IF NOT EXISTS parameters (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Isi dari nama yang benar-benar ada di data, bukan dari daftar tebakan.
INSERT INTO parameters (name)
SELECT DISTINCT parameter FROM readings
ON CONFLICT (name) DO NOTHING;

ALTER TABLE readings ADD COLUMN IF NOT EXISTS parameter_id INTEGER;

UPDATE readings r
   SET parameter_id = p.id
  FROM parameters p
 WHERE p.name = r.parameter
   AND r.parameter_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_readings_param_id
  ON readings (device_id, parameter_id, timestamp DESC);

COMMENT ON COLUMN readings.parameter_id IS
  'Identitas stabil parameter. Kolom teks parameter masih dipakai query sampai perpindahan selesai.';
