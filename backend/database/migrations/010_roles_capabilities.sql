-- Peran menjadi data, bukan kode.
--
-- Sebelumnya peran ditulis di dalam kode: authorize('admin','maintenance')
-- menempel di tiap route dan levelnya terkunci pada empat nilai. Menambah peran
-- atau menggeser satu kewenangan berarti mengubah kode dan deploy ulang.
--
-- Batasnya tetap jelas: KATALOG KAPABILITAS DITETAPKAN APLIKASI, karena setiap
-- kapabilitas harus punya titik penegakan nyata di dalam kode. Yang bebas
-- dirakit dari UI adalah kombinasinya menjadi peran.
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  description VARCHAR(200),
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_capabilities (
  role_id    INTEGER     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_id, capability)
);

-- Penugasan peran pada sebuah node aset. Berlaku untuk seluruh cabang di
-- bawahnya. node_id NULL berarti berlaku di seluruh plant.
CREATE TABLE IF NOT EXISTS user_roles (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  asset_node_id INTEGER REFERENCES asset_nodes(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, asset_node_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles (user_id);

-- Mencabut peran tidak otomatis memutus sesi yang sedang berjalan, karena token
-- JWT bersifat stateless. Nomor versi ini ikut ditanam di token dan diperiksa
-- saat validasi: menaikkannya membuat seluruh token lama tidak berlaku.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Peran bawaan yang setara dengan empat level lama, supaya user yang ada tidak
-- perlu dikonfigurasi ulang.
INSERT INTO roles (name, description, is_system) VALUES
  ('admin',       'Akses penuh termasuk pengaturan sistem', true),
  ('maintenance', 'Konfigurasi perangkat dan alarm',        true),
  ('operator',    'Memantau dan mengakui alarm',            true),
  ('viewer',      'Hanya melihat',                          true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap FROM roles r CROSS JOIN LATERAL (VALUES
  ('dashboard.view'), ('device.view'), ('report.view'), ('report.export'),
  ('alarm.view'), ('alarm.ack'), ('alarm.config'),
  ('device.manage'), ('mapping.manage'), ('gateway.manage'), ('unit.manage'), ('asset.manage'),
  ('user.manage'), ('role.manage'), ('smtp.manage'), ('audit.view')
) AS c(cap) WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap FROM roles r CROSS JOIN LATERAL (VALUES
  ('dashboard.view'), ('device.view'), ('report.view'), ('report.export'),
  ('alarm.view'), ('alarm.ack'), ('alarm.config'),
  ('device.manage'), ('mapping.manage'), ('gateway.manage'), ('unit.manage'), ('asset.manage')
) AS c(cap) WHERE r.name = 'maintenance'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap FROM roles r CROSS JOIN LATERAL (VALUES
  ('dashboard.view'), ('device.view'), ('report.view'), ('alarm.view'), ('alarm.ack')
) AS c(cap) WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap FROM roles r CROSS JOIN LATERAL (VALUES
  ('dashboard.view'), ('device.view'), ('report.view'), ('alarm.view')
) AS c(cap) WHERE r.name = 'viewer'
ON CONFLICT DO NOTHING;

-- Pindahkan user yang ada ke peran bawaan sesuai level lamanya, berlaku di
-- seluruh plant. Kolom level dibiarkan supaya kode lama tetap jalan selama
-- perpindahan.
INSERT INTO user_roles (user_id, role_id, asset_node_id)
SELECT u.id, r.id, NULL FROM users u JOIN roles r ON r.name = u.level
ON CONFLICT DO NOTHING;
