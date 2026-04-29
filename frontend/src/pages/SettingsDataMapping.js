import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const emptyParam = { name: '', address: '', dataType: 'float32be', length: 2, save: true };

function SettingsDataMapping() {
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState({ name: '', category: 'Power Meter', params: Array(24).fill(null).map(() => ({ ...emptyParam })) });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchData = async () => {
    const res = await api.get('/settings/device-types');
    setTypes(res.data);
  };

  useEffect(() => { fetchData(); }, []);

  const updateParam = (index, field, value) => {
    const newParams = [...form.params];
    newParams[index] = { ...newParams[index], [field]: value };
    setForm({ ...form, params: newParams });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        category: form.category,
        params: form.params.filter((p) => p.name.trim() !== '').map((p) => ({
          ...p,
          address: parseInt(p.address) || 0,
          length: parseInt(p.length) || 2,
        })),
      };

      if (editId) {
        await api.put(`/settings/device-types/${editId}`, payload);
      } else {
        await api.post('/settings/device-types', payload);
      }
      setShowForm(false);
      setEditId(null);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleEdit = (dt) => {
    const params = typeof dt.params === 'string' ? JSON.parse(dt.params) : (dt.params || []);
    // Pad to 24 params
    while (params.length < 24) params.push({ ...emptyParam });
    setForm({ name: dt.name, category: dt.category, params });
    setEditId(dt.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin hapus device type ini?')) return;
    await api.delete(`/settings/device-types/${id}`);
    fetchData();
  };

  return (
    <div>
      <h2 className="page-title">Data Mapping</h2>
      <div className="card">
        <button className="btn btn-primary" onClick={() => {
          setShowForm(!showForm); setEditId(null);
          setForm({ name: '', category: 'Power Meter', params: Array(24).fill(null).map(() => ({ ...emptyParam })) });
        }}>
          {showForm ? 'Cancel' : 'Add New Data Mapping'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
            <div className="form-row">
              <div className="form-group">
                <label>Device Type</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. PM 2200" required />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="Power Meter">Power Meter</option>
                  <option value="Energy Meter">Energy Meter</option>
                </select>
              </div>
            </div>

            <h4 style={{ marginTop: 16 }}>Parameters (max 24)</h4>
            <div style={{ overflowX: 'auto' }}>
              <div className="table-responsive" style={{ marginTop: 20 }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr><th>#</th><th>Name</th><th>Address</th><th>Data Type</th><th>Length</th><th>Save</th></tr>
                  </thead>
                  <tbody>
                    {form.params.map((p, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td><input value={p.name} onChange={(e) => updateParam(i, 'name', e.target.value)} style={{ width: 150, padding: 4, fontSize: 12 }} /></td>
                        <td><input type="number" value={p.address} onChange={(e) => updateParam(i, 'address', e.target.value)} style={{ width: 80, padding: 4, fontSize: 12 }} /></td>
                        <td>
                          <select value={p.dataType} onChange={(e) => updateParam(i, 'dataType', e.target.value)} style={{ padding: 4, fontSize: 12 }}>
                            <option value="float32be">Float 32 BE</option>
                            <option value="float32le">Float 32 LE</option>
                            <option value="int16">Int 16</option>
                            <option value="uint16">UInt 16</option>
                            <option value="int32">Int 32</option>
                          </select>
                        </td>
                        <td><input type="number" value={p.length} onChange={(e) => updateParam(i, 'length', e.target.value)} style={{ width: 50, padding: 4, fontSize: 12 }} /></td>
                        <td><input type="checkbox" checked={p.save} onChange={(e) => updateParam(i, 'save', e.target.checked)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>{editId ? 'Update' : 'Save'}</button>
          </form>
        )}
        <div className="table-responsive" style={{ marginTop: 20 }}>
          <table className="data-table" style={{ marginTop: 20 }}>
            <thead><tr><th>Device Type</th><th>Category</th><th>Actions</th></tr></thead>
            <tbody>
              {types.map((dt) => (
                <tr key={dt.id}>
                  <td>{dt.name}</td>
                  <td>{dt.category}</td>
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 8, padding: '4px 12px', fontSize: 12 }} onClick={() => handleEdit(dt)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => handleDelete(dt.id)}>Delete</button>
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

export default SettingsDataMapping;