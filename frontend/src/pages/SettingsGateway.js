import React, { useState, useEffect } from 'react';
import api from '../api/axios';

function SettingsGateway() {
  const [gateways, setGateways] = useState([]);
  const [form, setForm] = useState({
    name: '', protocol: 'modbus-rtu', port_or_ip: '', baudrate: 9600, parity: 'even'
  });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchData = async () => {
    const res = await api.get('/settings/gateways');
    setGateways(res.data);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, baudrate: parseInt(form.baudrate) };
      if (editId) {
        await api.put(`/settings/gateways/${editId}`, payload);
      } else {
        await api.post('/settings/gateways', payload);
      }
      setForm({ name: '', protocol: 'modbus-rtu', port_or_ip: '', baudrate: 9600, parity: 'even' });
      setEditId(null);
      setShowForm(false);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleEdit = (gw) => {
    setForm({
      name: gw.name, protocol: gw.protocol, port_or_ip: gw.port_or_ip,
      baudrate: gw.baudrate || 9600, parity: gw.parity || 'even',
    });
    setEditId(gw.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin hapus gateway ini?')) return;
    try {
      await api.delete(`/settings/gateways/${id}`);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  return (
    <div>
      <h2 className="page-title">Data Gateway Settings</h2>
      <div className="card">
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); }}>
          {showForm ? 'Cancel' : 'Add Data Gateway'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: 20, maxWidth: 500 }}>
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Protocol</label>
              <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                <option value="modbus-rtu">Modbus RTU</option>
                <option value="modbus-tcp">Modbus TCP</option>
              </select>
            </div>
            <div className="form-group">
              <label>{form.protocol === 'modbus-tcp' ? 'IP:PORT' : 'COM Port'}</label>
              <input
                value={form.port_or_ip}
                onChange={(e) => setForm({ ...form, port_or_ip: e.target.value })}
                placeholder={form.protocol === 'modbus-tcp' ? '192.168.1.100:502' : 'COM1'}
                required
              />
            </div>
            {form.protocol === 'modbus-rtu' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Baudrate</label>
                  <select value={form.baudrate} onChange={(e) => setForm({ ...form, baudrate: e.target.value })}>
                    <option value="9600">9600</option>
                    <option value="19200">19200</option>
                    <option value="38400">38400</option>
                    <option value="115200">115200</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Parity</label>
                  <select value={form.parity} onChange={(e) => setForm({ ...form, parity: e.target.value })}>
                    <option value="even">Even</option>
                    <option value="odd">Odd</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
            )}
            <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Save'}</button>
          </form>
        )}
        <div className="table-responsive" style={{ marginTop: 20 }}>
          <table className="data-table" style={{ marginTop: 20 }}>
            <thead>
              <tr><th>Name</th><th>Protocol</th><th>COM/IP:PORT</th><th>Baudrate</th><th>Parity</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {gateways.map((gw) => (
                <tr key={gw.id}>
                  <td>{gw.name}</td>
                  <td>{gw.protocol}</td>
                  <td>{gw.port_or_ip}</td>
                  <td>{gw.baudrate || '-'}</td>
                  <td>{gw.parity || '-'}</td>
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 8, padding: '4px 12px', fontSize: 12 }} onClick={() => handleEdit(gw)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => handleDelete(gw.id)}>Delete</button>
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

export default SettingsGateway;