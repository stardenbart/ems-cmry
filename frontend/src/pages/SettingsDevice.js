import React, { useState, useEffect } from 'react';
import api from '../api/axios';

function SettingsDevice() {
  const [devices, setDevices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [gateways, setGateways] = useState([]);
  const [form, setForm] = useState({
    name: '', address: '', group_id: '', device_type_id: '', data_gateway_id: ''
  });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchAll = async () => {
    try {
      const [devRes, grpRes, dtRes, gwRes] = await Promise.all([
        api.get('/devices'),
        api.get('/settings/groups'),
        api.get('/settings/device-types'),
        api.get('/settings/gateways'),
      ]);
      setDevices(devRes.data);
      setGroups(grpRes.data);
      setDeviceTypes(dtRes.data);
      setGateways(gwRes.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        address: parseInt(form.address),
        group_id: form.group_id ? parseInt(form.group_id) : null,
        device_type_id: parseInt(form.device_type_id),
        data_gateway_id: parseInt(form.data_gateway_id),
      };
      if (editId) {
        await api.put(`/devices/${editId}`, payload);
      } else {
        await api.post('/devices', payload);
      }
      resetForm();
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const resetForm = () => {
    setForm({ name: '', address: '', group_id: '', device_type_id: '', data_gateway_id: '' });
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (d) => {
    setForm({
      name: d.name,
      address: d.address,
      group_id: d.group_id || '',
      device_type_id: d.device_type_id,
      data_gateway_id: d.data_gateway_id,
    });
    setEditId(d.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin hapus device ini?')) return;
    await api.delete(`/devices/${id}`);
    fetchAll();
  };

  return (
    <div>
      <h2 className="page-title">Device Settings</h2>
      <div className="card">
        <button className="btn btn-primary" onClick={() => {
          if (showForm) {
            resetForm();
          } else {
            setForm({ name: '', address: '', group_id: '', device_type_id: '', data_gateway_id: '' });
            setEditId(null);
            setShowForm(true);
          }
        }}>
          {showForm ? 'Cancel' : 'Add New Device'}
        </button>
        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: 20, maxWidth: 600 }}>
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Address (Modbus Slave)</label>
                <input type="number" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Group</label>
                <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
                  <option value="">None</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <select value={form.device_type_id} onChange={(e) => setForm({ ...form, device_type_id: e.target.value })} required>
                  <option value="">-- Pilih --</option>
                  {deviceTypes.map((dt) => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Data Gateway</label>
                <select value={form.data_gateway_id} onChange={(e) => setForm({ ...form, data_gateway_id: e.target.value })} required>
                  <option value="">-- Pilih --</option>
                  {gateways.map((gw) => <option key={gw.id} value={gw.id}>{gw.name}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Save'}</button>
          </form>
        )}
        <div className="table-responsive" style={{ marginTop: 20 }}>
          <table className="data-table" style={{ marginTop: 20 }}>
            <thead>
              <tr><th>Name</th><th>Address</th><th>Group</th><th>Type</th><th>Data Gateway</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.address}</td>
                  <td>{d.group?.name || '-'}</td>
                  <td>{d.deviceType?.name || '-'}</td>
                  <td>{d.dataGateway?.name || '-'}</td>
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 8, padding: '4px 12px', fontSize: 12 }} onClick={() => handleEdit(d)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => handleDelete(d.id)}>Delete</button>
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

export default SettingsDevice;