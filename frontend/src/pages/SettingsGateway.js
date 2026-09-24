import React, { useState, useEffect } from 'react';
import api from '../api/axios';

function SettingsGateway() {
  const [gateways, setGateways] = useState([]);
  const [form, setForm] = useState({
    name: '', protocol: 'modbus-rtu', port_or_ip: '', baudrate: 9600, parity: 'even'
  });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(null);   // id gateway yang sedang diuji
  const [testResult, setTestResult] = useState(null);

  const handleTest = async (gw) => {
    setTesting(gw.id); setTestResult(null);
    try {
      const res = await api.post(`/settings/gateways/${gw.id}/test`);
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ gateway: gw.name, opened: false, note: err.response?.data?.error || 'Test failed', devices: [] });
    } finally { setTesting(null); }
  };

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
    if (!window.confirm('Delete this gateway?')) return;
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
                <option value="simulated">Simulated (no hardware yet)</option>
              </select>
              {form.protocol === 'simulated' ? (
                <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 6 }}>
                  Devices on this gateway get generated values from their Data Mapping, and are logged,
                  charted and alarmed like real ones. Once the RS485 / MOXA link is in place, switch the
                  protocol to Modbus RTU or TCP — the same devices start reading real data, history is kept.
                </div>
              ) : null}
            </div>
            <div className="form-group">
              <label>{form.protocol === 'modbus-tcp' ? 'IP:PORT' : form.protocol === 'simulated' ? 'Note' : 'COM Port'}</label>
              <input
                value={form.port_or_ip}
                onChange={(e) => setForm({ ...form, port_or_ip: e.target.value })}
                placeholder={form.protocol === 'modbus-tcp' ? '192.168.1.100:502' : form.protocol === 'simulated' ? 'e.g. waiting for MOXA' : 'COM1'}
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
                  <td>{gw.protocol === 'simulated' ? <span style={{ color: '#e67e22', fontWeight: 600 }}>simulated</span> : gw.protocol}</td>
                  <td>{gw.port_or_ip}</td>
                  <td>{gw.baudrate || '-'}</td>
                  <td>{gw.parity || '-'}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" style={{ marginRight: 8 }} disabled={testing !== null}
                      onClick={() => handleTest(gw)}>{testing === gw.id ? 'Testing…' : 'Test'}</button>
                    <button className="btn btn-outline btn-sm" style={{ marginRight: 8 }} onClick={() => handleEdit(gw)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(gw.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {testResult ? (
          <div className="card" style={{ marginTop: 16, borderLeft: `4px solid ${testResult.opened ? '#27ae60' : '#c0392b'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <strong>Connection test — {testResult.gateway}</strong>
              <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setTestResult(null)}>Close</button>
            </div>
            <div style={{ fontSize: 13, marginBottom: 8, color: testResult.opened ? '#1e8449' : '#c0392b' }}>
              {testResult.opened
                ? `Port opened${testResult.openMs !== undefined ? ` in ${testResult.openMs} ms` : ''}.`
                : 'Port could not be opened.'}
              {testResult.note ? <span style={{ color: '#555' }}> {testResult.note}</span> : null}
            </div>
            {testResult.devices && testResult.devices.length > 0 ? (
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead><tr><th>Device</th><th>Slave ID</th><th>Result</th><th style={{ textAlign: 'right' }}>Time</th></tr></thead>
                <tbody>
                  {testResult.devices.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td>{d.slaveId}</td>
                      <td style={{ color: d.replied ? '#1e8449' : '#c0392b' }}>{d.replied ? 'Replied' : 'No reply'} — {d.detail}</td>
                      <td style={{ textAlign: 'right' }}>{d.ms !== undefined ? `${d.ms} ms` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : testResult.opened ? (
              <div style={{ fontSize: 12, color: '#7f8c8d' }}>No devices are assigned to this gateway yet.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SettingsGateway;