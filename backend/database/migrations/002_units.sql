-- Tabel satuan, bisa disunting dari UI.
--
-- Konversi ke satuan dasar: nilai_dasar = nilai * factor + offset_value
-- offset_value ada karena suhu bukan sekadar perkalian; Kelvin ke Celsius
-- memerlukan pengurangan 273,15. Rumus yang hanya mengenal factor akan salah
-- untuk setiap pembacaan suhu.
CREATE TABLE IF NOT EXISTS units (
  id           SERIAL PRIMARY KEY,
  symbol       VARCHAR(20)      NOT NULL UNIQUE,
  name         VARCHAR(80)      NOT NULL,
  quantity     VARCHAR(40)      NOT NULL,
  base_symbol  VARCHAR(20)      NOT NULL,
  factor       DOUBLE PRECISION NOT NULL DEFAULT 1,
  offset_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_system    BOOLEAN          NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_units_quantity ON units (quantity);

-- Satuan bawaan. is_system = true berarti tidak boleh dihapus dari UI, karena
-- dipakai sebagai dasar konversi. Satuan buatan user punya is_system = false.
INSERT INTO units (symbol, name, quantity, base_symbol, factor, offset_value, is_system) VALUES
  ('Wh',    'Watt hour',            'energy',         'Wh',   1,       0, true),
  ('kWh',   'Kilowatt hour',        'energy',         'Wh',   1000,    0, true),
  ('MWh',   'Megawatt hour',        'energy',         'Wh',   1000000, 0, true),
  ('W',     'Watt',                 'power',          'W',    1,       0, true),
  ('kW',    'Kilowatt',             'power',          'W',    1000,    0, true),
  ('MW',    'Megawatt',             'power',          'W',    1000000, 0, true),
  ('var',   'Volt-ampere reactive', 'reactive_power', 'var',  1,       0, true),
  ('kvar',  'Kilovolt-ampere reactive', 'reactive_power', 'var', 1000, 0, true),
  ('VA',    'Volt-ampere',          'apparent_power', 'VA',   1,       0, true),
  ('kVA',   'Kilovolt-ampere',      'apparent_power', 'VA',   1000,    0, true),
  ('A',     'Ampere',               'current',        'A',    1,       0, true),
  ('mA',    'Milliampere',          'current',        'A',    0.001,   0, true),
  ('V',     'Volt',                 'voltage',        'V',    1,       0, true),
  ('kV',    'Kilovolt',             'voltage',        'V',    1000,    0, true),
  ('Hz',    'Hertz',                'frequency',      'Hz',   1,       0, true),
  ('degC',  'Derajat Celsius',      'temperature',    'degC', 1,       0, true),
  ('K',     'Kelvin',               'temperature',    'degC', 1, -273.15, true),
  ('Pa',    'Pascal',               'pressure',       'Pa',   1,       0, true),
  ('kPa',   'Kilopascal',           'pressure',       'Pa',   1000,    0, true),
  ('bar',   'Bar',                  'pressure',       'Pa',   100000,  0, true),
  ('m3/h',  'Meter kubik per jam',  'flow',           'm3/h', 1,       0, true),
  ('L/min', 'Liter per menit',      'flow',           'm3/h', 0.06,    0, true),
  ('%',     'Persen',               'ratio',          '%',    1,       0, true),
  ('-',     'Tanpa satuan',         'dimensionless',  '-',    1,       0, true)
ON CONFLICT (symbol) DO NOTHING;
