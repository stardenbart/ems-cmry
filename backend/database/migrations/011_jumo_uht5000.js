// JUMO LOGOSCREEN 601 di UHT 5000 — hierarki, tipe device, dan gateway simulasi.
//
// Perekam fisiknya belum tersambung ke RS485/MOXA, jadi device ini dipasang di
// gateway ber-protocol 'simulated': nilainya dibangkitkan dari metadata, tapi
// melewati jalur yang sama persis dengan device sungguhan. Begitu kabelnya
// terpasang, ubah protocol gateway ini menjadi modbus-rtu (atau modbus-tcp
// kalau lewat MOXA MGate) dari halaman Data Gateway — tidak ada kode maupun
// baris database lain yang perlu diubah, dan riwayat pembacaannya tetap utuh.
//
// ALAMAT REGISTER DI BAWAH MASIH SEMENTARA.
// PDF yang tersedia adalah data sheet 70652100T10Z001K000, bukan interface
// description Modbus-nya, jadi peta registernya belum bisa dipastikan. Yang
// pasti dari data sheet: maksimal 6 analog input universal, RS485 SUB-D 9 pin,
// Modbus RTU sebagai master ATAU slave (harus dikonfigurasi sebagai slave),
// baud sampai 115200. Sebelum gateway dialihkan ke Modbus sungguhan, alamatnya
// wajib dipastikan dengan tombol Read di Data Mapping — nilai yang terbaca
// harus cocok dengan angka di layar perekam.
const { QueryTypes } = require('sequelize');

const KANAL = [
  { tag: 'TT02', nominal: 37.9 },
  { tag: 'TT05', nominal: 42.0 },
  { tag: 'TT06', nominal: 40.7 },
  { tag: 'TT09', nominal: 44.6 },
  { tag: 'TT07B', nominal: 44.9 },
];

function params() {
  return KANAL.map((k, i) => ({
    name: k.tag,
    label: k.tag,
    // Provisional: lihat catatan di kepala berkas.
    address: i * 2,
    length: 2,
    dataType: 'float32be',
    save: true,
    kind: 'temperature',
    unit: 'degC',
    agg: 'gauge',
    precision: 1,
    conv_mode: 'none',
    scale: 1,
    offset: 0,
    // Rentang SENSOR Pt100, bukan rentang proses. Dipakai validasi untuk
    // menandai pembacaan yang mustahil, bukan untuk menandai proses menyimpang.
    min: -200,
    max: 850,
    featured: true,
    order: i,
    poll_class: 'normal',
    // Titik kerja untuk gateway simulasi, diambil dari layar perekam
    // 24 Sep 2026 13:22. Diabaikan begitu gateway memakai Modbus sungguhan.
    sim: { nominal: k.nominal, swing: 2.5 },
  }));
}

module.exports = async function run(sequelize, transaction) {
  const q = (sql, replacements) =>
    sequelize.query(sql, { replacements, transaction });
  const satu = async (sql, replacements) => {
    const rows = await sequelize.query(sql, {
      replacements, transaction, type: QueryTypes.SELECT,
    });
    return rows[0] || null;
  };

  // ── Hierarki: Plant Sentul > Gedung CMD 1 > UHT 5000 ──────────────────────
  // Akar masih bernama 'Plant' dari migrasi 007; beri nama yang sebenarnya.
  await q(`UPDATE asset_nodes SET name = 'Plant Sentul'
            WHERE parent_id IS NULL AND name = 'Plant'`);

  const akar = await satu('SELECT id FROM asset_nodes WHERE parent_id IS NULL ORDER BY id LIMIT 1');
  if (!akar) throw new Error('Node akar tidak ada, jalankan migrasi 007 dulu');

  const buatNode = async (parentId, name, type, sort) => {
    const ada = await satu(
      'SELECT id FROM asset_nodes WHERE name = :name AND parent_id IS NOT DISTINCT FROM :parent',
      { name, parent: parentId });
    if (ada) return ada.id;
    const baru = await satu(
      `INSERT INTO asset_nodes (parent_id, name, type, sort_order)
       VALUES (:parent, :name, :type, :sort) RETURNING id`,
      { parent: parentId, name, type, sort });
    return baru.id;
  };

  const gedung = await buatNode(akar.id, 'Gedung CMD 1', 'Building', 1);
  const mesin = await buatNode(gedung, 'UHT 5000', 'Machine', 1);

  // ── Gateway simulasi ──────────────────────────────────────────────────────
  let gw = await satu('SELECT id FROM data_gateways WHERE name = :name',
    { name: 'JUMO UHT 5000' });
  if (!gw) {
    gw = await satu(
      `INSERT INTO data_gateways (name, protocol, port_or_ip, baudrate, parity, created_at, updated_at)
       VALUES (:name, 'simulated', 'belum terpasang', 9600, 'none', now(), now())
       RETURNING id`, { name: 'JUMO UHT 5000' });
  }

  // ── Tipe device ───────────────────────────────────────────────────────────
  const NAMA_TIPE = 'JUMO LOGOSCREEN 601';
  let tipe = await satu('SELECT id FROM device_types WHERE name = :name', { name: NAMA_TIPE });
  if (!tipe) {
    tipe = await satu(
      `INSERT INTO device_types (name, category, params, created_at, updated_at)
       VALUES (:name, 'Recorder', CAST(:params AS jsonb), now(), now()) RETURNING id`,
      { name: NAMA_TIPE, params: JSON.stringify(params()) });
  }

  // ── Device ────────────────────────────────────────────────────────────────
  const NAMA_DEVICE = 'UHT 5000 Temperature Recorder';
  const ada = await satu('SELECT id FROM devices WHERE name = :name', { name: NAMA_DEVICE });
  if (!ada) {
    await q(
      `INSERT INTO devices (name, address, device_type_id, data_gateway_id,
                            asset_node_id, role, created_at, updated_at)
       VALUES (:name, 1, :tipe, :gw, :node, 'feeder', now(), now())`,
      { name: NAMA_DEVICE, tipe: tipe.id, gw: gw.id, node: mesin });
  }
};
