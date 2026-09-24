-- Aturan alarm yang dirakit dari UI, berlaku untuk besaran apa pun.
--
-- Tabel alarms yang lama khusus energi dan ambangnya tetap. Tabel ini menambah
-- yang kurang: durasi tahan supaya kedipan tidak memicu alarm, tingkat
-- keparahan, jadwal aktif, dan penerima per aturan.
CREATE TABLE IF NOT EXISTS alarm_rules (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(120) NOT NULL,
  device_id      INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  asset_node_id  INTEGER REFERENCES asset_nodes(id) ON DELETE CASCADE,
  parameter      VARCHAR(100) NOT NULL,
  operator       VARCHAR(4)   NOT NULL,
  threshold      DOUBLE PRECISION NOT NULL,
  -- Lama kondisi harus bertahan sebelum alarm menyala. Tanpa ini, satu lonjakan
  -- sesaat sudah cukup membangunkan orang di tengah malam.
  hold_seconds   INTEGER      NOT NULL DEFAULT 60,
  severity       VARCHAR(20)  NOT NULL DEFAULT 'warning',
  enabled        BOOLEAN      NOT NULL DEFAULT true,
  -- Jendela aktif harian. NULL berarti berlaku sepanjang waktu.
  active_from    TIME,
  active_to      TIME,
  recipients     TEXT,
  email_template VARCHAR(80),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT alarm_rules_sasaran CHECK (device_id IS NOT NULL OR asset_node_id IS NOT NULL),
  CONSTRAINT alarm_rules_operator CHECK (operator IN ('>', '>=', '<', '<=', '==', '!='))
);

CREATE INDEX IF NOT EXISTS idx_alarm_rules_device ON alarm_rules (device_id) WHERE enabled;

-- Riwayat penyalaan, termasuk kapan dipulihkan dan siapa yang mengakui.
CREATE TABLE IF NOT EXISTS alarm_events (
  id              BIGSERIAL PRIMARY KEY,
  rule_id         INTEGER REFERENCES alarm_rules(id) ON DELETE CASCADE,
  device_id       INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  parameter       VARCHAR(100),
  value           DOUBLE PRECISION,
  threshold       DOUBLE PRECISION,
  severity        VARCHAR(20),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at      TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by VARCHAR(50),
  notified        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_alarm_events_aktif ON alarm_events (rule_id) WHERE cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alarm_events_waktu ON alarm_events (started_at DESC);

-- Template email yang bisa disunting dari UI. Penanda {{nama}} diganti saat kirim.
CREATE TABLE IF NOT EXISTS email_templates (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL UNIQUE,
  subject    VARCHAR(200) NOT NULL,
  body       TEXT NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO email_templates (name, subject, body, is_system) VALUES
  ('default',
   '[{{severity}}] {{rule}} - {{device}}',
   E'Alarm menyala pada {{device}}.\n\nAturan    : {{rule}}\nParameter : {{parameter}}\nNilai     : {{value}} {{unit}}\nAmbang    : {{operator}} {{threshold}} {{unit}}\nWaktu     : {{time}}\nLokasi    : {{node}}\n\nPesan ini dikirim otomatis oleh Energy Monitoring System.',
   true)
ON CONFLICT (name) DO NOTHING;
