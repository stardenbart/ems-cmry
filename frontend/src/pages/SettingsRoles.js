import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

// Perakit peran. Kapabilitas yang tersedia diambil dari katalog milik aplikasi,
// bukan diketik bebas — setiap kapabilitas harus punya titik penegakan nyata di
// dalam kode. Yang dirakit di sini adalah kombinasinya.

function SettingsRoles() {
  const [katalog, setKatalog] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [userAktif, setUserAktif] = useState('');
  const [penugasan, setPenugasan] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', capabilities: [] });
  const [editId, setEditId] = useState(null);
  const [tugasBaru, setTugasBaru] = useState({ role_id: '', asset_node_id: '' });
  const [pesan, setPesan] = useState('');

  const muatRoles = useCallback(() => {
    api.get('/settings/roles').then((r) => setRoles(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    muatRoles();
    api.get('/settings/capabilities').then((r) => setKatalog(r.data)).catch(() => {});
    api.get('/settings/users').then((r) => setUsers(r.data)).catch(() => {});
    api.get('/assets/tree').then((r) => setNodes(r.data)).catch(() => {});
  }, [muatRoles]);

  const muatPenugasan = useCallback((id) => {
    if (!id) { setPenugasan([]); return; }
    api.get(`/settings/users/${id}/roles`).then((r) => setPenugasan(r.data)).catch(() => setPenugasan([]));
  }, []);

  useEffect(() => { muatPenugasan(userAktif); }, [userAktif, muatPenugasan]);

  const kelompok = katalog.reduce((acc, c) => {
    (acc[c.group] = acc[c.group] || []).push(c);
    return acc;
  }, {});

  const toggleCap = (key) => setForm((f) => ({
    ...f,
    capabilities: f.capabilities.includes(key)
      ? f.capabilities.filter((c) => c !== key)
      : [...f.capabilities, key],
  }));

  const simpan = async () => {
    setPesan('');
    try {
      if (editId) await api.put(`/settings/roles/${editId}`, form);
      else await api.post('/settings/roles', form);
      setForm({ name: '', description: '', capabilities: [] });
      setEditId(null);
      muatRoles();
    } catch (e) { setPesan(e.response?.data?.error || 'gagal menyimpan'); }
  };

  const sunting = (r) => {
    setEditId(r.id);
    setForm({ name: r.name, description: r.description || '', capabilities: r.capabilities || [] });
  };

  const hapus = async (r) => {
    if (!window.confirm(`Hapus peran ${r.name}?`)) return;
    try { await api.delete(`/settings/roles/${r.id}`); muatRoles(); }
    catch (e) { setPesan(e.response?.data?.error || 'gagal menghapus'); }
  };

  const tambahTugas = async () => {
    setPesan('');
    if (!userAktif || !tugasBaru.role_id) { setPesan('pilih user dan peran'); return; }
    try {
      await api.post(`/settings/users/${userAktif}/roles`, {
        role_id: Number(tugasBaru.role_id),
        asset_node_id: tugasBaru.asset_node_id ? Number(tugasBaru.asset_node_id) : null,
      });
      setTugasBaru({ role_id: '', asset_node_id: '' });
      muatPenugasan(userAktif);
    } catch (e) { setPesan(e.response?.data?.error || 'gagal menambah penugasan'); }
  };

  const hapusTugas = async (id) => {
    try { await api.delete(`/settings/users/${userAktif}/roles/${id}`); muatPenugasan(userAktif); }
    catch (e) { setPesan(e.response?.data?.error || 'gagal menghapus penugasan'); }
  };

  return (
    <div>
      <h2 className="page-title">Peran dan Hak Akses</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: '#c0392b' }}>{pesan}</div>
      ) : null}

      {/* Penugasan peran ke user */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Penugasan peran
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12 }}>User
            <select value={userAktif} onChange={(e) => setUserAktif(e.target.value)}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 180 }}>
              <option value="">— pilih user —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.name})</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Peran
            <select value={tugasBaru.role_id} onChange={(e) => setTugasBaru((f) => ({ ...f, role_id: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 160 }}>
              <option value="">— pilih peran —</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Berlaku di
            <select value={tugasBaru.asset_node_id}
              onChange={(e) => setTugasBaru((f) => ({ ...f, asset_node_id: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 200 }}>
              <option value="">Seluruh plant</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
            </select>
          </label>
          <button onClick={tambahTugas}
            style={{ padding: '7px 16px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Tambah
          </button>
        </div>

        {userAktif ? (
          <div className="table-responsive" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead><tr><th>Peran</th><th>Berlaku di</th><th></th></tr></thead>
              <tbody>
                {penugasan.map((p) => (
                  <tr key={p.id}>
                    <td>{p.role_name}</td>
                    <td>{p.node_name || 'Seluruh plant'}
                      <span style={{ color: '#7f8c8d', fontSize: 11 }}> (termasuk seluruh cabang di bawahnya)</span>
                    </td>
                    <td>
                      <button onClick={() => hapusTugas(p.id)}
                        style={{ fontSize: 12, padding: '3px 9px', cursor: 'pointer', color: '#c0392b' }}>Cabut</button>
                    </td>
                  </tr>
                ))}
                {penugasan.length === 0 ? (
                  <tr><td colSpan="3" style={{ color: '#95a5a6' }}>Belum ada penugasan.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Perakit peran */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          {editId ? `Ubah peran #${editId}` : 'Peran baru'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ fontSize: 12 }}>Nama
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 180 }} />
          </label>
          <label style={{ fontSize: 12, flex: 1, minWidth: 240 }}>Keterangan
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, width: '100%' }} />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          {Object.entries(kelompok).map(([grup, daftar]) => (
            <div key={grup}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1B4F72', marginBottom: 6 }}>{grup}</div>
              {daftar.map((c) => (
                <label key={c.key} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, marginBottom: 5 }}>
                  <input type="checkbox" checked={form.capabilities.includes(c.key)}
                    onChange={() => toggleCap(c.key)} style={{ marginTop: 2 }} />
                  <span>{c.label}<br /><code style={{ fontSize: 10, color: '#95a5a6' }}>{c.key}</code></span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button onClick={simpan}
            style={{ padding: '7px 18px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {editId ? 'Simpan perubahan' : 'Tambah peran'}
          </button>
          {editId ? (
            <button onClick={() => { setEditId(null); setForm({ name: '', description: '', capabilities: [] }); }}
              style={{ padding: '7px 18px', cursor: 'pointer' }}>Batal</button>
          ) : null}
        </div>
        {editId ? (
          <div style={{ fontSize: 11, color: '#e67e22', marginTop: 8 }}>
            Mengubah kapabilitas akan memutus sesi seluruh pemegang peran ini; mereka perlu login ulang.
          </div>
        ) : null}
      </div>

      {/* Daftar peran */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Daftar peran ({roles.length})
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Nama</th><th>Keterangan</th><th>Kapabilitas</th><th>Jenis</th><th></th></tr></thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ color: '#7f8c8d' }}>{r.description || '-'}</td>
                  <td>{(r.capabilities || []).length}</td>
                  <td>{r.is_system ? 'bawaan' : 'buatan'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => sunting(r)} style={{ fontSize: 12, padding: '3px 9px', cursor: 'pointer', marginRight: 6 }}>Ubah</button>
                    {!r.is_system ? (
                      <button onClick={() => hapus(r)} style={{ fontSize: 12, padding: '3px 9px', cursor: 'pointer', color: '#c0392b' }}>Hapus</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SettingsRoles;
