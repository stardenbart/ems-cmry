import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';

// Pengelola hierarki aset: Plant -> Building -> Line -> Machine, kedalaman bebas.
//
// Versi sebelumnya meminta user mengetik tipe bebas lalu memilih induk dari
// dropdown datar — tidak jelas harus mulai dari mana. Sekarang alurnya dimulai
// dari baris pohon itu sendiri: "Add under this node", dengan level berikutnya
// sudah terpilih. Tipe tetap teks bebas di database, jadi pabrik dengan struktur
// berbeda tidak memerlukan perubahan kode.

const LEVELS = ['Plant', 'Building', 'Area', 'Line', 'Machine', 'Panel'];

// Level yang disarankan untuk anak sebuah node. Nama lama berbahasa Indonesia
// ikut dikenali supaya node yang sudah ada tetap mendapat saran yang benar.
const NEXT = {
  plant: 'Building',
  building: 'Line', gedung: 'Line', area: 'Line',
  line: 'Machine',
  machine: 'Machine', mesin: 'Machine', panel: 'Machine',
};
const saranAnak = (type) => NEXT[String(type || '').toLowerCase()] || 'Machine';

const ROLE = [
  { key: 'incomer', label: 'Incomer — measures this whole node' },
  { key: 'feeder', label: 'Feeder — part of the node total' },
  { key: 'excluded', label: 'Excluded — never counted' },
];

const WARNA_LEVEL = {
  plant: '#1B4F72', building: '#2874A6', gedung: '#2874A6', area: '#5D6D7E',
  line: '#117A65', machine: '#AF601A', mesin: '#AF601A', panel: '#7D3C98',
};

function LevelBadge({ type }) {
  const warna = WARNA_LEVEL[String(type || '').toLowerCase()] || '#7f8c8d';
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
      textTransform: 'uppercase', color: '#fff', background: warna,
      padding: '2px 7px', borderRadius: 3, marginRight: 8, verticalAlign: 'middle',
    }}>{type}</span>
  );
}

function SettingsAssets() {
  const [nodes, setNodes] = useState([]);
  const [devices, setDevices] = useState([]);
  // panel = null | { mode: 'add', parentId } | { mode: 'edit', node }
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'Plant', parent_id: '' });
  const [pesan, setPesan] = useState('');
  const [error, setError] = useState(false);

  const muat = useCallback(() => {
    api.get('/assets/tree').then((r) => setNodes(r.data)).catch(() => { setError(true); setPesan('Failed to load the asset tree'); });
    api.get('/devices').then((r) => setDevices(r.data)).catch(() => {});
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const byId = useMemo(() => {
    const m = {};
    nodes.forEach((n) => { m[n.id] = n; });
    return m;
  }, [nodes]);

  // Urutan pohon dengan kedalaman, supaya indentasinya benar.
  const berjenjang = useMemo(() => {
    const anak = {};
    nodes.forEach((n) => {
      const k = n.parent_id === null ? 'root' : n.parent_id;
      (anak[k] = anak[k] || []).push(n);
    });
    const keluar = [];
    const telusuri = (kunci, dalam) => {
      (anak[kunci] || []).forEach((n) => {
        keluar.push({ ...n, dalam, punyaAnak: !!(anak[n.id] && anak[n.id].length) });
        telusuri(n.id, dalam + 1);
      });
    };
    telusuri('root', 0);
    return keluar;
  }, [nodes]);

  // "Plant Sentul › Gedung CMD 1 › UHT 5000"
  const jalur = useCallback((id) => {
    const bagian = [];
    const dilihat = new Set();
    let kini = byId[id];
    while (kini && !dilihat.has(kini.id)) {
      bagian.unshift(kini.name);
      dilihat.add(kini.id);
      kini = kini.parent_id === null ? null : byId[kini.parent_id];
    }
    return bagian.join(' › ');
  }, [byId]);

  // Node beserta seluruh keturunannya — tidak boleh dipilih sebagai induk baru
  // saat memindahkan node, karena itu akan membuat lingkaran.
  const keturunan = useCallback((id) => {
    const hasil = new Set([id]);
    let tambah = true;
    while (tambah) {
      tambah = false;
      nodes.forEach((n) => {
        if (n.parent_id !== null && hasil.has(n.parent_id) && !hasil.has(n.id)) {
          hasil.add(n.id); tambah = true;
        }
      });
    }
    return hasil;
  }, [nodes]);

  const info = (teks) => { setError(false); setPesan(teks); };
  const gagal = (e, cadangan) => { setError(true); setPesan(e.response?.data?.error || cadangan); };

  const bukaTambah = (parentId) => {
    const induk = parentId ? byId[parentId] : null;
    setPanel({ mode: 'add', parentId });
    setForm({ name: '', type: induk ? saranAnak(induk.type) : 'Plant', parent_id: parentId || '' });
    setPesan('');
  };

  const bukaEdit = (n) => {
    setPanel({ mode: 'edit', node: n });
    setForm({ name: n.name, type: n.type, parent_id: n.parent_id || '' });
    setPesan('');
  };

  const tutup = () => { setPanel(null); setForm({ name: '', type: 'Plant', parent_id: '' }); };

  const simpan = async () => {
    if (!form.name.trim()) { setError(true); setPesan('Please enter a name'); return; }
    if (!String(form.type).trim()) { setError(true); setPesan('Please choose a level'); return; }
    const body = {
      name: form.name.trim(),
      type: String(form.type).trim(),
      parent_id: form.parent_id ? Number(form.parent_id) : null,
    };
    try {
      if (panel.mode === 'edit') await api.put(`/assets/nodes/${panel.node.id}`, body);
      else await api.post('/assets/nodes', body);
      info(panel.mode === 'edit' ? `Saved "${body.name}"` : `Added ${body.type} "${body.name}"`);
      tutup(); muat();
    } catch (e) { gagal(e, 'Failed to save'); }
  };

  const hapus = async (n) => {
    if (!window.confirm(`Delete ${n.type} "${n.name}"?`)) return;
    try { await api.delete(`/assets/nodes/${n.id}`); info(`Deleted "${n.name}"`); muat(); }
    catch (e) { gagal(e, 'Failed to delete'); }
  };

  const ubahDevice = async (d, field, value) => {
    try {
      await api.put(`/devices/${d.id}`, { [field]: value === '' ? null : value });
      muat();
    } catch (e) { gagal(e, 'Failed to update device'); }
  };

  const deviceDi = (nodeId) => devices.filter((d) => d.asset_node_id === nodeId);
  const tanpaNode = devices.filter((d) => !d.asset_node_id);

  const indukPanel = panel && panel.mode === 'add' && panel.parentId ? byId[panel.parentId] : null;
  const dilarang = panel && panel.mode === 'edit' ? keturunan(panel.node.id) : new Set();

  const opsiNode = (kecuali) => berjenjang
    .filter((x) => !kecuali.has(x.id))
    .map((x) => (
      <option key={x.id} value={x.id}>{' '.repeat(x.dalam * 4)}{x.name} ({x.type})</option>
    ));

  const labelKecil = { fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 };

  return (
    <div>
      <h2 className="page-title">Asset Hierarchy</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: error ? '#c0392b' : '#1e8449' }}>{pesan}</div>
      ) : null}

      <div className="card" style={{ marginBottom: 16, fontSize: 13, color: '#555', lineHeight: 1.6 }}>
        Build the tree from the top down: add a <strong>Plant</strong>, then use <strong>Add under</strong> on
        a row to create its <strong>Buildings</strong>, then <strong>Lines</strong> and <strong>Machines</strong>.
        Levels can be skipped — a machine can sit directly under a building when it is not part of a line.
        Devices are placed on any node from the device rows below it, or from <em>Settings → Device</em>.
      </div>

      {/* Form panel */}
      {panel ? (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #1B4F72' }}>
          <div style={labelKecil}>
            {panel.mode === 'edit'
              ? `Edit ${panel.node.type}`
              : indukPanel ? 'Add under' : 'Add a top-level node'}
          </div>
          {panel.mode === 'add' ? (
            <div style={{ fontSize: 14, marginBottom: 14 }}>
              {indukPanel ? (
                <>New <strong>{form.type || '…'}</strong> under <strong>{jalur(indukPanel.id)}</strong></>
              ) : (
                <>New <strong>{form.type || '…'}</strong> at the top of the tree</>
              )}
            </div>
          ) : null}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>Level</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {LEVELS.map((l) => (
                <button key={l} type="button" onClick={() => setForm((f) => ({ ...f, type: l }))}
                  className={`btn btn-outline btn-sm${form.type === l ? ' active' : ''}`}>{l}</button>
              ))}
              <input value={LEVELS.includes(form.type) ? '' : form.type} placeholder="or type a custom level"
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                style={{ padding: 5, fontSize: 12, minWidth: 170 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12 }}>Name
              <input autoFocus value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') simpan(); }}
                placeholder={form.type === 'Plant' ? 'e.g. Plant Sentul'
                  : form.type === 'Building' ? 'e.g. Gedung CMD 1'
                  : form.type === 'Line' ? 'e.g. Serac Line 1' : 'e.g. UHT 5000'}
                style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 240 }} />
            </label>

            {panel.mode === 'edit' ? (
              <label style={{ fontSize: 12 }}>Parent
                <select value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
                  style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 260 }}>
                  <option value="">— none (top level) —</option>
                  {opsiNode(dilarang)}
                </select>
              </label>
            ) : null}

            <button className="btn btn-primary" onClick={simpan}>
              {panel.mode === 'edit' ? 'Save' : 'Add'}
            </button>
            <button className="btn btn-outline" onClick={tutup}>Cancel</button>
          </div>
        </div>
      ) : null}

      {/* Tree */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ ...labelKecil, marginBottom: 0 }}>Asset tree ({nodes.length} nodes, {devices.length} devices)</div>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => bukaTambah(null)}>
            + Add Plant
          </button>
        </div>

        {berjenjang.length === 0 ? (
          <div style={{ color: '#95a5a6', fontSize: 13, padding: 12 }}>
            The tree is empty. Start with <strong>+ Add Plant</strong>.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Node</th><th>Devices</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {berjenjang.map((n) => (
                  <React.Fragment key={n.id}>
                    <tr>
                      <td>
                        <span style={{ paddingLeft: n.dalam * 24, color: '#95a5a6' }}>
                          {n.dalam > 0 ? '└ ' : ''}
                        </span>
                        <LevelBadge type={n.type} />
                        <strong>{n.name}</strong>
                      </td>
                      <td>{Number(n.device_count) || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button onClick={() => bukaTambah(n.id)} className="btn btn-outline btn-sm" style={{ marginRight: 6 }}>
                          + Add {saranAnak(n.type)} under
                        </button>
                        <button onClick={() => bukaEdit(n)} className="btn btn-outline btn-sm" style={{ marginRight: 6 }}>
                          Edit
                        </button>
                        <button onClick={() => hapus(n)} className="btn btn-danger btn-sm"
                          disabled={n.punyaAnak || Number(n.device_count) > 0}
                          title={n.punyaAnak || Number(n.device_count) > 0
                            ? 'Move or delete its children and devices first' : undefined}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {deviceDi(n.id).map((d) => (
                      <tr key={`d-${d.id}`} style={{ background: '#fbfbfb' }}>
                        <td style={{ paddingLeft: (n.dalam + 1) * 24 + 12, fontSize: 12 }}>
                          <span style={{ color: '#95a5a6' }}>• </span>{d.name}
                          <span style={{ color: '#95a5a6', fontSize: 11 }}> device</span>
                        </td>
                        <td colSpan="2" style={{ textAlign: 'right' }}>
                          <select value={d.role || 'feeder'} onChange={(e) => ubahDevice(d, 'role', e.target.value)}
                            title="How this device counts in the node total"
                            style={{ padding: 3, fontSize: 11, minWidth: 250, marginRight: 8 }}>
                            {ROLE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                          <select value={d.asset_node_id || ''} onChange={(e) => ubahDevice(d, 'asset_node_id', e.target.value)}
                            title="Move device to another node"
                            style={{ padding: 3, fontSize: 11, minWidth: 200 }}>
                            {opsiNode(new Set())}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 10 }}>
          A node that has an <strong>Incomer</strong> device uses that meter alone as its total. Otherwise every
          <strong> Feeder</strong> in its branch is added up. Without this rule a main panel and its sub-panels
          would be counted twice.
        </div>
      </div>

      {tanpaNode.length > 0 ? (
        <div className="card">
          <div style={{ ...labelKecil, color: '#e67e22' }}>Devices not placed yet ({tanpaNode.length})</div>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Device</th><th>Place in</th></tr></thead>
              <tbody>
                {tanpaNode.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>
                      <select defaultValue="" onChange={(e) => ubahDevice(d, 'asset_node_id', e.target.value)}
                        style={{ padding: 4, fontSize: 12, minWidth: 240 }}>
                        <option value="">— select node —</option>
                        {opsiNode(new Set())}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SettingsAssets;
