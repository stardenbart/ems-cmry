// Katalog kapabilitas dan pemeriksaan hak akses.
//
// KATALOG DITETAPKAN DI SINI, bukan di database, karena setiap kapabilitas harus
// punya titik penegakan nyata di dalam kode. Admin tidak bisa mengarang
// kapabilitas baru dari UI — yang bebas dirakit adalah kombinasinya menjadi
// peran. Kalau katalog ini boleh diisi dari UI, orang akan membuat kapabilitas
// yang tidak menjaga apa pun dan mengira sistemnya aman.

const KATALOG = [
  { key: 'dashboard.view',  group: 'Monitoring',    label: 'View dashboards' },
  { key: 'device.view',     group: 'Monitoring',    label: 'View devices and parameters' },
  { key: 'report.view',     group: 'Monitoring',    label: 'View reports' },
  { key: 'report.export',   group: 'Monitoring',    label: 'Export reports' },

  { key: 'alarm.view',      group: 'Alarm',         label: 'View alarms' },
  { key: 'alarm.ack',       group: 'Alarm',         label: 'Acknowledge alarms' },
  { key: 'alarm.config',    group: 'Alarm',         label: 'Configure alarm rules' },

  { key: 'device.manage',   group: 'Configuration', label: 'Manage devices' },
  { key: 'mapping.manage',  group: 'Configuration', label: 'Manage data mapping' },
  { key: 'gateway.manage',  group: 'Configuration', label: 'Manage gateways' },
  { key: 'unit.manage',     group: 'Configuration', label: 'Manage units' },
  { key: 'asset.manage',    group: 'Configuration', label: 'Manage asset hierarchy' },

  { key: 'user.manage',     group: 'System',        label: 'Manage users' },
  { key: 'role.manage',     group: 'System',        label: 'Manage roles' },
  { key: 'smtp.manage',     group: 'System',        label: 'Configure SMTP' },
  { key: 'audit.view',      group: 'System',        label: 'View audit log' },
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
