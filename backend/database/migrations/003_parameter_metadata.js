// Isi metadata semantik untuk parameter yang sudah ada.
//
// Sampai sekarang sebuah parameter hanya tahu alamat dan tipe datanya, tidak tahu
// itu besaran apa, satuannya apa, dan bagaimana cara mengagregasinya. Akibatnya
// setiap perhitungan harus ditulis khusus untuk energi. Metadata di bawah ini yang
// membuat agregasi, tampilan, dan validasi bisa generik.
//
// Migrasi ini hanya MENAMBAH field. Field lama (name, address, length, dataType,
// save) tidak disentuh, jadi perilaku pembacaan tidak berubah sama sekali.
const { QueryTypes } = require('sequelize');

// kind + agg + unit per nama parameter PM2200 yang terpasang saat ini.
// Yang tidak dikenali mendapat default aman: gauge, tanpa satuan, tanpa batas.
const DEFAULTS = {
  current:         { kind: 'current',        unit: 'A',    agg: 'gauge',   min: 0,    max: 5000,  precision: 2, poll_class: 'normal' },
  voltage:         { kind: 'voltage',        unit: 'V',    agg: 'gauge',   min: 0,    max: 600,   precision: 2, poll_class: 'normal' },
  power:           { kind: 'power',          unit: 'kW',   agg: 'gauge',   min: -5000, max: 5000, precision: 2, poll_class: 'fast' },
  reactive_power:  { kind: 'reactive_power', unit: 'kvar', agg: 'gauge',   min: -5000, max: 5000, precision: 2, poll_class: 'normal' },
  apparent_power:  { kind: 'apparent_power', unit: 'kVA',  agg: 'gauge',   min: 0,    max: 5000,  precision: 2, poll_class: 'normal' },
  frequency:       { kind: 'frequency',      unit: 'Hz',   agg: 'gauge',   min: 45,   max: 55,    precision: 2, poll_class: 'normal' },
  power_factor:    { kind: 'power_factor',   unit: '-',    agg: 'gauge',   min: -1,   max: 1,     precision: 3, poll_class: 'normal' },
  energy:          { kind: 'energy',         unit: 'Wh',   agg: 'counter', min: 0,    max: 1e12,  precision: 0, poll_class: 'slow' },
  thd:             { kind: 'thd',            unit: '%',    agg: 'gauge',   min: 0,    max: 100,   precision: 2, poll_class: 'slow' },
};

// Parameter yang tampil sebagai kartu utama di halaman device, beserta urutannya.
const FEATURED = [
  'Active Power Total',
  'Voltage L-L Avg',
  'Current Avg',
  'Frequency',
  'Active Energy Delivered (Into Load)',
  'PF Total',
];

function classify(name) {
  const n = String(name).toLowerCase();
  if (n.includes('energy')) return DEFAULTS.energy;
  if (n.startsWith('thd') || n.includes('thd')) return DEFAULTS.thd;
  if (n.includes('pf') || n.includes('power factor')) return DEFAULTS.power_factor;
  if (n.includes('reactive power')) return DEFAULTS.reactive_power;
  if (n.includes('apparent power')) return DEFAULTS.apparent_power;
  if (n.includes('power')) return DEFAULTS.power;
  if (n.includes('frequency')) return DEFAULTS.frequency;
  if (n.includes('voltage')) return DEFAULTS.voltage;
  if (n.includes('current')) return DEFAULTS.current;
  return { kind: 'other', unit: '-', agg: 'gauge', min: null, max: null, precision: 2, poll_class: 'normal' };
}

module.exports = async function run(sequelize, transaction) {
  const types = await sequelize.query('SELECT id, params FROM device_types', {
    type: QueryTypes.SELECT, transaction,
  });

  for (const t of types) {
    const params = typeof t.params === 'string' ? JSON.parse(t.params) : (t.params || []);
    if (!Array.isArray(params)) continue;

    const enriched = params.map((p, i) => {
      const d = classify(p.name);
      const featuredIdx = FEATURED.indexOf(p.name);
      return {
        ...p,
        // Metadata semantik
        kind:       p.kind       !== undefined ? p.kind       : d.kind,
        unit:       p.unit       !== undefined ? p.unit       : d.unit,
        agg:        p.agg        !== undefined ? p.agg        : d.agg,
        precision:  p.precision  !== undefined ? p.precision  : d.precision,
        // Konversi. 'none' berarti nilai perangkat dipakai apa adanya, yang benar
        // untuk PM2200 karena meter sudah mengeluarkan satuan teknik.
        conv_mode:  p.conv_mode  !== undefined ? p.conv_mode  : 'none',
        scale:      p.scale      !== undefined ? p.scale      : 1,
        offset:     p.offset     !== undefined ? p.offset     : 0,
        // Batas kewajaran untuk validasi saat ingestion
        min:        p.min        !== undefined ? p.min        : d.min,
        max:        p.max        !== undefined ? p.max        : d.max,
        // Tampilan dan laju polling
        featured:   p.featured   !== undefined ? p.featured   : featuredIdx >= 0,
        order:      p.order      !== undefined ? p.order      : (featuredIdx >= 0 ? featuredIdx : 100 + i),
        poll_class: p.poll_class !== undefined ? p.poll_class : d.poll_class,
      };
    });

    await sequelize.query('UPDATE device_types SET params = :p, updated_at = now() WHERE id = :id', {
      replacements: { p: JSON.stringify(enriched), id: t.id }, transaction,
    });
  }
};
