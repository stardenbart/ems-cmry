import React, { useState, useEffect } from 'react';
import api from '../api/axios';

function SettingsAlarm() {
  const [alarms, setAlarms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState({});
  const [form, setForm] = useState({
    device_id: '', alarm_name: '', message: '', mail_to: '',
    conditions: [{ parameter: '', operator: 'greater', threshold: '' }],
  });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchData = async () => {
    try {
      const [alarmRes, devRes, dtRes] = await Promise.all([
        api.get('/alarms/config'),
        api.get('/devices'),
        api.get('/settings/device-types'),
      ]);
      setAlarms(alarmRes.data);
      setDevices(devRes.data);
      const dtMap = {};
      dtRes.data.forEach((dt) => { dtMap[dt.id] = dt; });
      setDeviceTypes(dtMap);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchData(); }, []);

  const getParamsForDevice = (deviceId) => {
    const device = devices.find((d) => d.id === parseInt(deviceId));
    if (!device) return [];
    const dt = deviceTypes[device.device_type_id];
    if (!dt) return [];
    const params = typeof dt.params === 'string' ? JSON.parse(dt.params) : (dt.params || []);
    return params.map((p) => p.name);
  };

  const addCondition = () => {
    setForm({ ...form, conditions: [...form.conditions, { parameter: '', operator: 'greater', threshold: '' }] });
  };

  const updateCondition = (index, field, value) => {
    const newConds = [...form.conditions];
    newConds[index] = { ...newConds[index], [field]: value };
    setForm({ ...form, conditions: newConds });
  };

  const removeCondition = (index) => {
    setForm({ ...form, conditions: form.conditions.filter((_, i) => i !== index) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        device_id: parseInt(form.device_id),
        conditions: form.conditions.filter((c) => c.parameter && c.threshold !== ''),
      };
      if (editId) {
        await api.put(`/alarms/config/${editId}`, payload);
      } else {
        await api.post('/alarms/config', payload);
      }
      setShowForm(false);
      setEditId(null);
      setForm({ device_id: '', alarm_name: '', message: '', mail_to: '', conditions: [{ parameter: '', operator: 'greater', threshold: '' }] });
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleEdit = (a) => {
    setForm({
      device_id: a.device_id,
      alarm_name: a.alarm_name,
      message: a.message || '',
      mail_to: a.mail_to || '',
      conditions: a.conditions && a.conditions.length > 0 ? a.conditions : [{ parameter: '', operator: 'greater', threshold: '' }],
    });
    setEditId(a.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin hapus alarm ini?')) return;
    await api.delete(`/alarms/config/${id}`);
    fetchData();
  };

  const paramOptions = form.device_id ? getParamsForDevice(form.device_id) : [];

  return (
    <div>
      <h2 className="page-title">Alarm Settings</h2>
      <div className="card">
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); }}>
          {showForm ? 'Cancel' : 'Add New Alarm'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: 20, maxWidth: 600 }}>
            <div className="form-group">
              <label>Alarm Name</label>
              <input value={form.alarm_name} onChange={(e) => setForm({ ...form, alarm_name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Device</label>
              <select value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} required>
                <option value="">-- Pilih Device --</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <h4>Conditions</h4>
            {form.conditions.map((cond, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <select value={cond.parameter} onChange={(e) => updateCondition(i, 'parameter', e.target.value)} style={{ flex: 2, padding: 6 }}>
                  <option value="">-- Parameter --</option>
                  {paramOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={cond.operator} onChange={(e) => updateCondition(i, 'operator', e.target.value)} style={{ flex: 1, padding: 6 }}>
                  <option value="greater">Greater</option>
                  <option value="less">Less</option>
                  <option value="equal">Equal</option>
                  <option value="greaterEqual">Greater Equal</option>
                  <option value="lessEqual">Less Equal</option>
                </select>
                <input type="number" step="any" value={cond.threshold} onChange={(e) => updateCondition(i, 'threshold', e.target.value)} placeholder="Value" style={{ flex: 1, padding: 6 }} />
                {form.conditions.length > 1 && (
                  <button type="button" className="btn btn-danger" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => removeCondition(i)}>X</button>
                )}
              </div>
            ))}
            <button type="button" className="btn" style={{ padding: '4px 12px', fontSize: 12, border: '1px solid #ccc', marginBottom: 12 }} onClick={addCondition}>Add More Condition</button>

            <div className="form-group">
              <label>Message</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={2} />
            </div>
            <div className="form-group">
              <label>Mail To</label>
              <input type="email" value={form.mail_to} onChange={(e) => setForm({ ...form, mail_to: e.target.value })} placeholder="abc@domain.com" />
            </div>
            <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Save'}</button>
          </form>
        )}
        <div className="table-responsive" style={{ marginTop: 20 }}>
          <table className="data-table" style={{ marginTop: 20 }}>
            <thead><tr><th>Device</th><th>Alarm Name</th><th>Message</th><th>Mail To</th><th>Actions</th></tr></thead>
            <tbody>
              {alarms.map((a) => (
                <tr key={a.id}>
                  <td>{a.device?.name || a.device_id}</td>
                  <td>{a.alarm_name}</td>
                  <td>{a.message}</td>
                  <td>{a.mail_to}</td>
                  <td>
                    <button className="btn btn-primary" style={{ marginRight: 8, padding: '4px 12px', fontSize: 12 }} onClick={() => handleEdit(a)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => handleDelete(a.id)}>Delete</button>
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

export default SettingsAlarm;