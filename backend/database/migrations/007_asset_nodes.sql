-- Hierarki aset: pohon yang bentuk dan kedalamannya ditentukan user.
--
-- Tabel groups hanya satu tingkat dan datar, sehingga tidak bisa menjawab
-- "berapa konsumsi Gedung CMD 1", apalagi "berapa pemakaian mesin filler di
-- Serac Line 1". `type` sengaja berupa teks bebas (Plant, Gedung, Line, Mesin,
-- Area) supaya pabrik dengan struktur berbeda tidak perlu perubahan kode.
CREATE TABLE IF NOT EXISTS asset_nodes (
  id         SERIAL PRIMARY KEY,
  parent_id  INTEGER REFERENCES asset_nodes(id) ON DELETE RESTRICT,
  name       VARCHAR(100) NOT NULL,
  type       VARCHAR(40)  NOT NULL DEFAULT 'Area',
  sort_order INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_nodes_parent ON asset_nodes (parent_id);

-- Device menempel ke node mana pun, bukan hanya ke daun. Meter incomer gedung
-- menempel ke node gedung, meter per mesin menempel ke node mesin.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS asset_node_id INTEGER REFERENCES asset_nodes(id);

-- role menentukan perlakuan saat rollup:
--   incomer  = mengukur seluruh node, dipakai sendirian sebagai total node
--   feeder   = bagian dari total, dijumlahkan bersama anak-anak node
--   excluded = tidak pernah ikut rollup (meter redundan atau uji coba)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'feeder';

CREATE INDEX IF NOT EXISTS idx_devices_node ON devices (asset_node_id);

-- Node akar untuk plant.
INSERT INTO asset_nodes (parent_id, name, type, sort_order)
SELECT NULL, 'Plant', 'Plant', 0
WHERE NOT EXISTS (SELECT 1 FROM asset_nodes WHERE parent_id IS NULL);

-- Setiap group yang ada menjadi satu node di bawah akar, sehingga tidak ada
-- penataan ulang manual. Device ikut dipindahkan ke node pasangannya.
INSERT INTO asset_nodes (parent_id, name, type, sort_order)
SELECT (SELECT id FROM asset_nodes WHERE parent_id IS NULL ORDER BY id LIMIT 1),
       g.name, 'Area', g.id
  FROM groups g
 WHERE NOT EXISTS (SELECT 1 FROM asset_nodes a WHERE a.name = g.name AND a.parent_id IS NOT NULL);

UPDATE devices d
   SET asset_node_id = a.id
  FROM groups g
  JOIN asset_nodes a ON a.name = g.name AND a.parent_id IS NOT NULL
 WHERE d.group_id = g.id
   AND d.asset_node_id IS NULL;

-- Device tanpa group menempel langsung ke akar agar tidak hilang dari pohon.
UPDATE devices
   SET asset_node_id = (SELECT id FROM asset_nodes WHERE parent_id IS NULL ORDER BY id LIMIT 1)
 WHERE asset_node_id IS NULL;

COMMENT ON COLUMN devices.role IS 'incomer | feeder | excluded';
