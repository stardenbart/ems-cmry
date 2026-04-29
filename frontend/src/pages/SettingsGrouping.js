import React, { useState, useEffect } from 'react';
import api from '../api/axios';

function SettingsGrouping() {
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ name: '' });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchData = async () => {
    const res = await api.get('/settings/groups');
    setGroups(res.data);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/settings/groups/${editId}`, form);
      } else {
        await api.post('/settings/groups', form);
      }
      setForm({ name: '' });
      setEditId(null);
      setShowForm(false);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleEdit = (g) => {
    setForm({ name: g.name });
    setEditId(g.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin hapus group ini?')) return;
    await api.delete(`/settings/groups/${id}`);
    fetchData();
  };

  return (
    <div>
      <h2 className="page-title">Grouping</h2>
      <div className="card">
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '' }); }}>
          {showForm ? 'Cancel' : 'Add New Group'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: 20, maxWidth: 400 }}>
            <div className="form-group">
              <label>Group Name</label>
              <input value={form.name} onChange={(e) => setForm({ name: e.target.value })} required />
            </div>
            <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Submit'}</button>
          </form>
        )}
        <div className="table-responsive" style={{ marginTop: 20 }}>
          <table className="data-table" style={{ marginTop: 20 }}>
            <thead><tr><th>Group Name</th><th>Actions</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 8, padding: '4px 12px', fontSize: 12 }} onClick={() => handleEdit(g)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => handleDelete(g.id)}>Delete</button>
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

export default SettingsGrouping;