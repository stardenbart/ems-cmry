// Pohon aset dan agregasi yang naik mengikutinya.
//
// Satu aturan dipakai di semua tingkat, sehingga tidak ada kode khusus
// "total pabrik" yang terpisah dari "total line".
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

// Seluruh node beserta device-nya, dalam satu query rekursif.
async function subtree(nodeId) {
  return sequelize.query(`
    WITH RECURSIVE cabang AS (
      SELECT id, parent_id, name, type, sort_order, 0 AS depth
        FROM asset_nodes WHERE id = :nodeId
      UNION ALL
      SELECT a.id, a.parent_id, a.name, a.type, a.sort_order, c.depth + 1
        FROM asset_nodes a JOIN cabang c ON a.parent_id = c.id
    )
    SELECT * FROM cabang ORDER BY depth, sort_order, name`,
    { replacements: { nodeId }, type: QueryTypes.SELECT });
}

async function rootNode() {
  const [row] = await sequelize.query(
    'SELECT id FROM asset_nodes WHERE parent_id IS NULL ORDER BY id LIMIT 1',
    { type: QueryTypes.SELECT });
  return row ? row.id : null;
}

// Device yang dihitung untuk sebuah node.
//
// Aturannya:
//   node punya device role=incomer  -> pakai incomer itu saja
//   tidak punya incomer             -> seluruh feeder di node ini dan anak-anaknya
//   role=excluded                   -> tidak pernah ikut
//
// Tanpa aturan ini, menjumlahkan panel utama bersama sub-panelnya akan
// menghitung energi yang sama dua kali.
async function devicesForRollup(nodeId) {
  const nodes = await subtree(nodeId);
  const ids = nodes.map((n) => n.id);
  if (ids.length === 0) return { devices: [], mode: 'kosong', nodes };

  const all = await sequelize.query(
    `SELECT id, name, role, asset_node_id, device_type_id FROM devices
      WHERE asset_node_id IN (:ids) AND role <> 'excluded'`,
    { replacements: { ids }, type: QueryTypes.SELECT });

  const incomer = all.filter((d) => d.role === 'incomer' && d.asset_node_id === nodeId);
  if (incomer.length > 0) return { devices: incomer, mode: 'incomer', nodes };

  return { devices: all.filter((d) => d.role === 'feeder'), mode: 'feeder', nodes };
}

// Selisih yang tidak teralokasi: incomer dikurangi jumlah seluruh feeder di
// bawahnya. Isinya rugi distribusi, beban yang belum dimeter, dan kesalahan
// pemasangan CT. Ditampilkan, bukan disembunyikan — kalau angkanya besar itu
// temuan, bukan error.
async function unallocated(nodeId, agg, hitung) {
  const nodes = await subtree(nodeId);
  const ids = nodes.map((n) => n.id);
  if (ids.length === 0) return null;

  const all = await sequelize.query(
    `SELECT id, name, role, asset_node_id FROM devices
      WHERE asset_node_id IN (:ids) AND role <> 'excluded'`,
    { replacements: { ids }, type: QueryTypes.SELECT });

  const incomer = all.filter((d) => d.role === 'incomer' && d.asset_node_id === nodeId);
  const feeder = all.filter((d) => d.role === 'feeder');
  if (incomer.length === 0 || feeder.length === 0) return null;

  const totalIncomer = await hitung(incomer);
  const totalFeeder = await hitung(feeder);
  if (totalIncomer === null || totalFeeder === null) return null;

  return {
    incomer: totalIncomer,
    feeder: totalFeeder,
    selisih: totalIncomer - totalFeeder,
    persen: totalIncomer === 0 ? null : ((totalIncomer - totalFeeder) / totalIncomer) * 100,
  };
}

module.exports = { subtree, rootNode, devicesForRollup, unallocated };
