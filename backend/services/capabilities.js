// Katalog kapabilitas dan pemeriksaan hak akses.
//
// KATALOG DITETAPKAN DI SINI, bukan di database, karena setiap kapabilitas harus
// punya titik penegakan nyata di dalam kode. Admin tidak bisa mengarang
// kapabilitas baru dari UI — yang bebas dirakit adalah kombinasinya menjadi
// peran. Kalau katalog ini boleh diisi dari UI, orang akan membuat kapabilitas
// yang tidak menjaga apa pun dan mengira sistemnya aman.

const KATALOG = [
  { key: 'dashboard.view',  group: 'Monitoring',   label: 'Lihat dashboard' },
  { key: 'device.view',     group: 'Monitoring',   label: 'Lihat device dan parameter' },
  { key: 'report.view',     group: 'Monitoring',   label: 'Lihat laporan' },
  { key: 'report.export',   group: 'Monitoring',   label: 'Ekspor laporan' },

  { key: 'alarm.view',      group: 'Alarm',        label: 'Lihat alarm' },
  { key: 'alarm.ack',       group: 'Alarm',        label: 'Acknowledge alarm' },
  { key: 'alarm.config',    group: 'Alarm',        label: 'Atur aturan alarm' },

  { key: 'device.manage',   group: 'Konfigurasi',  label: 'Kelola device' },
  { key: 'mapping.manage',  group: 'Konfigurasi',  label: 'Kelola data mapping' },
  { key: 'gateway.manage',  group: 'Konfigurasi',  label: 'Kelola gateway' },
  { key: 'unit.manage',     group: 'Konfigurasi',  label: 'Kelola satuan' },
  { key: 'asset.manage',    group: 'Konfigurasi',  label: 'Kelola hierarki aset' },

  { key: 'user.manage',     group: 'Sistem',       label: 'Kelola user' },
  { key: 'role.manage',     group: 'Sistem',       label: 'Kelola peran' },
  { key: 'smtp.manage',     group: 'Sistem',       label: 'Atur SMTP' },
  { key: 'audit.view',      group: 'Sistem',       label: 'Lihat audit log' },
];

const KUNCI = new Set(KATALOG.map((c) => c.key));

function valid(cap) {
  return KUNCI.has(cap);
}

// Buang kapabilitas yang tidak ada di katalog. Berkas atau request dari luar
// tidak boleh menyelipkan kunci yang tidak menjaga apa pun.
function saring(daftar) {
  return [...new Set((daftar || []).filter(valid))];
}

// Apakah penugasan berlaku pada node yang diminta?
//
// Penugasan tanpa node berlaku di seluruh plant. Penugasan pada sebuah node
// berlaku untuk node itu dan seluruh cabang di bawahnya, jadi pemeriksaannya
// menelusuri ke atas dari node yang diminta.
function berlakuDiNode(assignmentNodeId, nodeId, indukDari) {
  if (assignmentNodeId === null || assignmentNodeId === undefined) return true;
  if (nodeId === null || nodeId === undefined) return false;

  let kini = Number(nodeId);
  const dikunjungi = new Set();
  while (kini !== null && kini !== undefined && !dikunjungi.has(kini)) {
    if (kini === Number(assignmentNodeId)) return true;
    dikunjungi.add(kini);
    kini = indukDari[kini];
  }
  return false;
}

// assignments: [{ capabilities: [...], asset_node_id }]
// indukDari: { nodeId: parentId }
function boleh(assignments, capability, nodeId, indukDari) {
  if (!valid(capability)) return false;
  return (assignments || []).some((a) =>
    (a.capabilities || []).includes(capability) &&
    berlakuDiNode(a.asset_node_id, nodeId, indukDari || {}));
}

// Seluruh kapabilitas yang dimiliki, tanpa memandang node. Dipakai UI untuk
// menyembunyikan menu yang tidak akan pernah bisa diakses.
function semuaKapabilitas(assignments) {
  const out = new Set();
  (assignments || []).forEach((a) => (a.capabilities || []).forEach((c) => out.add(c)));
  return [...out];
}

module.exports = { KATALOG, valid, saring, berlakuDiNode, boleh, semuaKapabilitas };
