-- Index utama untuk seluruh query dashboard.
-- Sebelumnya readings hanya punya primary key, sehingga setiap query per device
-- dan parameter melakukan sequential scan.
CREATE INDEX IF NOT EXISTS idx_readings_lookup
  ON readings (device_id, parameter, timestamp DESC);

-- Penanda kualitas per baris. 0 = good, 1 = suspect, 2 = estimated.
-- SMALLINT dipilih karena kolom ini akan ada di puluhan juta baris.
-- Default 0 supaya seluruh data lama tetap dianggap good dan tidak ada
-- perhitungan yang berubah begitu kolom ini ditambahkan.
ALTER TABLE readings ADD COLUMN IF NOT EXISTS quality SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN readings.quality IS '0=good, 1=suspect (gagal validasi), 2=estimated';

-- Kepemilikan gateway oleh collector. Hari ini hanya ada satu collector sehingga
-- nilainya konstan, tapi kolomnya disiapkan sekarang supaya penambahan collector
-- kedua tidak perlu migrasi skema di tengah operasi.
ALTER TABLE data_gateways
  ADD COLUMN IF NOT EXISTS collector_id VARCHAR(50) NOT NULL DEFAULT 'default';
