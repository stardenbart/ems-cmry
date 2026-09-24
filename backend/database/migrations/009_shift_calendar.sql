-- Kalender shift dan hari non-produksi.
--
-- Prasyarat untuk laporan dan baseline yang jujur. Membandingkan Senin 08:00
-- dengan Minggu 08:00 tidak bermakna kalau yang satu produksi penuh dan satunya
-- libur. Tanpa kalender ini, setiap metrik per periode membandingkan hal yang
-- tidak setara.
CREATE TABLE IF NOT EXISTS shifts (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  start_time TIME        NOT NULL,
  end_time   TIME        NOT NULL,
  -- Hari berlaku sebagai daftar angka 0..6, 0 = Minggu. NULL berarti setiap hari.
  weekdays   SMALLINT[],
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hari yang menyimpang dari pola: libur nasional, cuti bersama, shutdown
-- terencana, atau maintenance besar.
CREATE TABLE IF NOT EXISTS calendar_days (
  id         SERIAL PRIMARY KEY,
  day        DATE        NOT NULL UNIQUE,
  kind       VARCHAR(30) NOT NULL,
  note       VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_days_kind CHECK (kind IN ('holiday', 'shutdown', 'maintenance', 'production'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_days_hari ON calendar_days (day);

COMMENT ON COLUMN calendar_days.kind IS
  'holiday | shutdown | maintenance | production — production dipakai untuk menandai hari kerja di tanggal yang biasanya libur';

-- Pola tiga shift yang lazim di pabrik. Bisa disunting atau dihapus dari UI.
INSERT INTO shifts (name, start_time, end_time, weekdays)
SELECT * FROM (VALUES
  ('Shift 1', TIME '07:00', TIME '15:00', ARRAY[1,2,3,4,5,6]::SMALLINT[]),
  ('Shift 2', TIME '15:00', TIME '23:00', ARRAY[1,2,3,4,5,6]::SMALLINT[]),
  ('Shift 3', TIME '23:00', TIME '07:00', ARRAY[1,2,3,4,5,6]::SMALLINT[])
) AS v(name, start_time, end_time, weekdays)
WHERE NOT EXISTS (SELECT 1 FROM shifts);
