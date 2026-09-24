import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';

// Pengelola hierarki aset: Plant -> Gedung -> Line -> Mesin, kedalaman bebas.
//
// Sebelum halaman ini ada, pohon aset hanya bisa diubah lewat API dan device
// tidak bisa ditempatkan ke gedung atau line dari UI sama sekali.

const ROLE = [
  { key: 'incomer', label: 'incomer — mengukur seluruh node ini' },
  { key: 'feeder', label: 'feeder — bagian dari total' },
  { key: 'excluded', label: 'excluded — tidak ikut dihitung' },
];

const TIPE_UMUM = ['Plant', 'Gedung', 'Area', 'Line', 'Mesin', 'Panel'];

function SettingsAssets() {
  const [nodes, setNodes] = useState([]);
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'Line', parent_id: '' });
  const [editId, setEditId] = useState(null);
  const [pesan, setPesan] = useState('');

  const muat = useCallback(() => {
    api.get('/assets/tree').then((r) => setNodes(r.data)).catch(() => setPesan('gagal memuat pohon'));
    api.get('/devices').then((r) => setDevices(r.data)).catch(() => {});
  }, []);

  useEffect(() => { muat(); }, [muat]);

  // Susun jadi daftar berurut dengan kedalaman, supaya indentasinya benar.
  const berjenjang = useMemo(() => {
    const anak = {};
    nodes.forEach((n) => {
      const k = n.parent_id === null ? 'root' : n.parent_id;
      (anak[k] = anak[k] || []).push(n);
    });
    const keluar = [];
    const telusuri = (kunci, dalam) => {
      (anak[kunci] || []).forEach((n) => {
        keluar.push({ ...n, dalam });
        telusuri(n.id, dalam + 1);
      });
    };
    telusuri('root', 0);
    return keluar;
  }, [nodes]);

  const deviceDi = (nodeId) => devices.filter((d) => d.asset_node_id === nodeId);

  const simpan = async () => {
    setPesan('');
    if (!form.name.trim()) { setPesan('nama diperlukan'); return; }
    const body = {
      name: form.name, type: form.type,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
    };
    try {
      if (editId) await api.put(`/assets/nodes/${editId}`, body);
      else await api.post('/assets/nodes', body);
      setForm({ name: '', type: 'Line', parent_id: '' }); setEditId(null); muat();
    } catch (e) { setPesan(e.response?.data?.error || 'gagal menyimpan'); }
  };

  const hapus = async (n) => {
    if (!window.confirm(`Hapus node "${n.name}"?`)) return;
    try { await api.delete(`/assets/nodes/${n.id}`); muat(); }
    catch (e) { setPesan(e.response?.data?.error || 'gagal menghapus'); }
  };

  const ubahDevice = async (d, field, value) => {
    setPesan('');
    try {
      await api.put(`/devices/${d.id}`, { [field]: value === '' ? null : value });
      muat();
    } catch (e) { setPesan(e.response?.data?.error || 'gagal mengubah device'); }
  };

  const tanpaNode = devices.filter((d) => !d.asset_node_id);

  return (
    <div>
      <h2 className="page-title">Hierarki Aset</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: '#c0392b' }}>{pesan}</div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          {editId ? `Ubah node #${editId}` : 'Node baru'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12 }}>Nama
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="misal Serac Line 1"
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 200 }} />
          </label>
          <label style={{ fontSize: 12 }}>Tipe
            <input list="tipe-node" value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 140 }} />
            <datalist id="tipe-node">
              {TIPE_UMUM.map((t) => <option key={t} value={t} />)}
            </datalist>
          </label>
          <label style={{ fontSize: 12 }}>Induk
            <select value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 220 }}>
              <option value="">— tanpa induk (akar) —</option>
              {berjenjang.map((n) => (
                <option key={n.id} value={n.id}>{' '.repeat(n.dalam * 3)}{n.name}</option>
              ))}
            </select>
          </label>
          <button onClick={simpan}
            style={{ padding: '7px 16px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {editId ? 'Simpan' : 'Tambah'}
          </button>
          {editId ? (
            <button onClick={() => { setEditId(null); setForm({ name: '', type: 'Line', parent_id: '' }); }}
              style={{ padding: '7px 16px', cursor: 'pointer' }}>Batal</button>
          ) : null}
        </div>
        <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 10 }}>
          Tipe bebas diisi — Plant, Gedung, Line, Mesin, atau apa pun yang sesuai pabrik kamu.
          Kedalaman pohon tidak dibatasi.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Pohon aset
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Node</th><th>Tipe</th><th>Device</th><th></th></tr></thead>
            <tbody>
              {berjenjang.map((n) => (
                <React.Fragment key={n.id}>
                  <tr>
                    <td>
                      <span style={{ paddingLeft: n.dalam * 22, color: '#95a5a6' }}>
                        {n.dalam > 0 ? '└ ' : ''}
                      </span>
                      <strong>{n.name}</strong>
                    </td>
                    <td style={{ color: '#7f8c8d' }}>{n.type}</td>
                    <td>{n.device_count}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button onClick={() => { setEditId(n.id); setForm({ name: n.name, type: n.type, parent_id: n.parent_id || '' }); }}
                        style={{ fontSize: 12, padding: '3px 9px', cursor: 'pointer', marginRight: 6 }}>Ubah</button>
                      <button onClick={() => hapus(n)}
                        style={{ fontSize: 12, padding: '3px 9px', cursor: 'pointer', color: '#c0392b' }}>Hapus</button>
                    </td>
                  </tr>
                  {deviceDi(n.id).map((d) => (
                    <tr key={`d-${d.id}`} style={{ background: '#fbfbfb' }}>
                      <td style={{ paddingLeft: (n.dalam + 1) * 22 + 12, fontSize: 12 }}>
                        <span style={{ color: '#95a5a6' }}>• </span>{d.name}
                      </td>
                      <td style={{ fontSize: 11, color: '#7f8c8d' }}>device</td>
                      <td colSpan="2">
                        <select value={d.role || 'feeder'} onChange={(e) => ubahDevice(d, 'role', e.target.value)}
                          style={{ padding: 3, fontSize: 11, minWidth: 250, marginRight: 8 }}>
                          {ROLE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                        <select value={d.asset_node_id || ''} onChange={(e) => ubahDevice(d, 'asset_node_id', e.target.value)}
                          style={{ padding: 3, fontSize: 11, minWidth: 180 }}>
                          {berjenjang.map((x) => (
                            <option key={x.id} value={x.id}>{' '.repeat(x.dalam * 3)}{x.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 10 }}>
          Node yang punya device <strong>incomer</strong> memakai angka incomer itu saja sebagai total.
          Kalau tidak ada, seluruh <strong>feeder</strong> di cabangnya dijumlahkan. Tanpa aturan ini,
          panel utama dan sub-panelnya akan terhitung dua kali.
        </div>
      </div>

      {tanpaNode.length > 0 ? (
        <div className="card">
          <div style={{ fontSize: 11, color: '#e67e22', textTransform: 'uppercase', marginBottom: 12 }}>
            Device belum ditempatkan ({tanpaNode.length})
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Device</th><th>Tempatkan di</th></tr></thead>
              <tbody>
                {tanpaNode.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>
                      <select defaultValue="" onChange={(e) => ubahDevice(d, 'asset_node_id', e.target.value)}
                        style={{ padding: 4, fontSize: 12, minWidth: 220 }}>
                        <option value="">— pilih node —</option>
                        {berjenjang.map((x) => (
                          <option key={x.id} value={x.id}>{' '.repeat(x.dalam * 3)}{x.name}</option>
                        ))}
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
