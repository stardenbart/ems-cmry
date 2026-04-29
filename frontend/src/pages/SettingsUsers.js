import React, { useState, useEffect } from 'react';
import api from '../api/axios';

function SettingsUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', username: '', password: '', level: 'viewer' });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchUsers = async () => {
    const res = await api.get('/settings/users');
    setUsers(res.data);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/settings/users/${editId}`, form);
      } else {
        await api.post('/settings/users', form);
      }
      setForm({ name: '', username: '', password: '', level: 'viewer' });
      setEditId(null);
      setShowForm(false);
      fetchUsers();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleEdit = (user) => {
    setForm({ name: user.name, username: user.username, password: '', level: user.level });
    setEditId(user.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin hapus user ini?')) return;
    await api.delete(`/settings/users/${id}`);
    fetchUsers();
  };

  return (
    <div>
      <h2 className="page-title">User Management</h2>
      <div className="card">
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', username: '', password: '', level: 'viewer' }); }}>
          {showForm ? 'Cancel' : 'Add New User'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: 20, maxWidth: 500 }}>
            <div className="form-group"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="form-group"><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
            <div className="form-group"><label>Password {editId ? '(kosongkan jika tidak diubah)' : ''}</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editId} /></div>
            <div className="form-group">
              <label>Level</label>
              <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="maintenance">Maintenance</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Save'}</button>
          </form>
        )}
        <div className="table-responsive" style={{ marginTop: 20 }}>
          <table className="data-table" style={{ marginTop: 20 }}>
            <thead><tr><th>Name</th><th>Username</th><th>Level</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td>{u.username}</td><td>{u.level}</td>
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 8, padding: '4px 12px', fontSize: 12 }} onClick={() => handleEdit(u)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => handleDelete(u.id)}>Delete</button>
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

export default SettingsUsers;