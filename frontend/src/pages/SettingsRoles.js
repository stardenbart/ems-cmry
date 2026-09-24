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
    } catch (e) { setPesan(e.response?.data?.error || 'Failed to save'); }
  };

  const sunting = (r) => {
    setEditId(r.id);
    setForm({ name: r.name, description: r.description || '', capabilities: r.capabilities || [] });
  };

  const hapus = async (r) => {
    if (!window.confirm(`Delete role ${r.name}?`)) return;
    try { await api.delete(`/settings/roles/${r.id}`); muatRoles(); }
    catch (e) { setPesan(e.response?.data?.error || 'Failed to delete'); }
  };

  const tambahTugas = async () => {
    setPesan('');
    if (!userAktif || !tugasBaru.role_id) { setPesan('select a user and a role'); return; }
    try {
      await api.post(`/settings/users/${userAktif}/roles`, {
        role_id: Number(tugasBaru.role_id),
        asset_node_id: tugasBaru.asset_node_id ? Number(tugasBaru.asset_node_id) : null,
      });
      setTugasBaru({ role_id: '', asset_node_id: '' });
      muatPenugasan(userAktif);
    } catch (e) { setPesan(e.response?.data?.error || 'Failed to add assignment'); }
  };

  const hapusTugas = async (id) => {
    try { await api.delete(`/settings/users/${userAktif}/roles/${id}`); muatPenugasan(userAktif); }
    catch (e) { setPesan(e.response?.data?.error || 'Failed to remove assignment'); }
  };

  return (
    <div>
      <h2 className="page-title">Roles & Permissions</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: '#c0392b' }}>{pesan}</div>
      ) : null}

      {/* Penugasan peran ke user */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Role assignments
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12 }}>User
            <select value={userAktif} onChange={(e) => setUserAktif(e.target.value)}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 180 }}>
              <option value="">— select user —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.name})</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Role
            <select value={tugasBaru.role_id} onChange={(e) => setTugasBaru((f) => ({ ...f, role_id: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 160 }}>
              <option value="">— select role —</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Applies to
            <select value={tugasBaru.asset_node_id}
              onChange={(e) => setTugasBaru((f) => ({ ...f, asset_node_id: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 200 }}>
              <option value="">Whole plant</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
            </select>
          </label>
          <button className="btn btn-primary" onClick={tambahTugas}>
            Add
          </button>
        </div>

        {userAktif ? (
          <div className="table-responsive" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead><tr><th>Role</th><th>Applies to</th><th></th></tr></thead>
              <tbody>
                {penugasan.map((p) => (
                  <tr key={p.id}>
                    <td>{p.role_name}</td>
                    <td>{p.node_name || 'Whole plant'}
                      <span style={{ color: '#7f8c8d', fontSize: 11 }}> (including every branch below it)</span>
                    </td>
                    <td>
                      <button onClick={() => hapusTugas(p.id)}
                        className="btn btn-danger btn-sm">Revoke</button>
                    </td>
                  </tr>
                ))}
                {penugasan.length === 0 ? (
                  <tr><td colSpan="3" style={{ color: '#95a5a6' }}>No assignments yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Perakit peran */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          {editId ? `Edit role #${editId}` : 'New role'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ fontSize: 12 }}>Name
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 180 }} />
          </label>
          <label style={{ fontSize: 12, flex: 1, minWidth: 240 }}>Description
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
          <button className="btn btn-primary" onClick={simpan}>
            {editId ? 'Save changes' : 'Add role'}
          </button>
          {editId ? (
            <button onClick={() => { setEditId(null); setForm({ name: '', description: '', capabilities: [] }); }}
              className="btn btn-outline">Cancel</button>
          ) : null}
        </div>
        {editId ? (
          <div style={{ fontSize: 11, color: '#e67e22', marginTop: 8 }}>
            Changing capabilities signs out every holder of this role; they will need to log in again.
          </div>
        ) : null}
      </div>

      {/* Role list */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Roles ({roles.length})
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Description</th><th>Capabilities</th><th>Kind</th><th></th></tr></thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ color: '#7f8c8d' }}>{r.description || '-'}</td>
                  <td>{(r.capabilities || []).length}</td>
                  <td>{r.is_system ? 'built-in' : 'custom'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => sunting(r)} className="btn btn-outline btn-sm" style={{ marginRight: 6 }}>Edit</button>
                    {!r.is_system ? (
                      <button onClick={() => hapus(r)} className="btn btn-danger btn-sm">Delete</button>
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
