import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';

// Device settings.
//
// The old flat "group" field is replaced by a position in the asset tree plus a
// rollup role. Without those two a device cannot be placed under a building or
// line, and totals cannot avoid double counting.

const ROLES = [
  { key: 'incomer', label: 'Incomer — measures this whole node' },
  { key: 'feeder', label: 'Feeder — part of the total' },
  { key: 'excluded', label: 'Excluded — never counted in rollups' },
];

const EMPTY = {
  name: '', address: '', asset_node_id: '', role: 'feeder',
  device_type_id: '', data_gateway_id: '',
};

function SettingsDevice() {
  const [devices, setDevices] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [gateways, setGateways] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [dev, tree, dt, gw] = await Promise.all([
        api.get('/devices'),
        api.get('/assets/tree'),
        api.get('/settings/device-types'),
        api.get('/settings/gateways'),
      ]);
      setDevices(dev.data);
      setNodes(tree.data);
      setDeviceTypes(dt.data);
      setGateways(gw.data);
    } catch (err) {
      setMessage('Failed to load data');
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Flatten the tree so the dropdown can show depth by indentation.
  const flatNodes = useMemo(() => {
    const children = {};
    nodes.forEach((n) => {
      const k = n.parent_id === null ? 'root' : n.parent_id;
      (children[k] = children[k] || []).push(n);
    });
    const out = [];
    const walk = (key, depth) => {
      (children[key] || []).forEach((n) => {
        out.push({ ...n, depth });
        walk(n.id, depth + 1);
      });
    };
    walk('root', 0);
    return out;
  }, [nodes]);

  const nodeName = (id) => {
    const n = nodes.find((x) => x.id === id);
    return n ? n.name : '—';
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    const payload = {
      name: form.name,
      address: parseInt(form.address),
      asset_node_id: form.asset_node_id ? parseInt(form.asset_node_id) : null,
      role: form.role || 'feeder',
      device_type_id: parseInt(form.device_type_id),
      data_gateway_id: parseInt(form.data_gateway_id),
    };
    try {
      if (editId) await api.put(`/devices/${editId}`, payload);
      else await api.post('/devices', payload);
      setShowForm(false); setEditId(null); setForm(EMPTY);
      fetchAll();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to save');
    }
  };

  const edit = (d) => {
    setForm({
      name: d.name, address: d.address,
      asset_node_id: d.asset_node_id || '',
      role: d.role || 'feeder',
      device_type_id: d.device_type_id, data_gateway_id: d.data_gateway_id,
    });
    setEditId(d.id); setShowForm(true);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this device?')) return;
    try { await api.delete(`/devices/${id}`); fetchAll(); }
    catch (err) { setMessage(err.response?.data?.error || 'Failed to delete'); }
  };

  const field = { padding: 6, marginTop: 4, minWidth: 180, display: 'block' };

  return (
    <div>
      <h2 className="page-title">Device Settings</h2>

      {message ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: '#c0392b' }}>{message}</div>
      ) : null}

      <div className="card">
        <button className="btn btn-primary"
          onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY); }}>
          {showForm ? 'Cancel' : 'Add Device'}
        </button>

        {showForm && (
          <form onSubmit={submit} style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12 }}>Device Name
                <input value={form.name} required
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={field} />
              </label>

              <label style={{ fontSize: 12 }}>Slave Address
                <input type="number" min="1" max="247" value={form.address} required
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  style={{ ...field, minWidth: 110 }} />
              </label>

              <label style={{ fontSize: 12 }}>Device Type
                <select value={form.device_type_id} required
                  onChange={(e) => setForm((f) => ({ ...f, device_type_id: e.target.value }))} style={field}>
                  <option value="">— select —</option>
                  {deviceTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 12 }}>Data Gateway
                <select value={form.data_gateway_id} required
                  onChange={(e) => setForm((f) => ({ ...f, data_gateway_id: e.target.value }))} style={field}>
                  <option value="">— select —</option>
                  {gateways.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.port_or_ip})</option>)}
                </select>
              </label>

              <label style={{ fontSize: 12 }}>Asset Location
                <select value={form.asset_node_id}
                  onChange={(e) => setForm((f) => ({ ...f, asset_node_id: e.target.value }))}
                  style={{ ...field, minWidth: 240 }}>
                  <option value="">— not placed —</option>
                  {flatNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {' '.repeat(n.depth * 3)}{n.name} ({n.type})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 12 }}>Rollup Role
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  style={{ ...field, minWidth: 280 }}>
                  {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </label>
            </div>

            <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 10, maxWidth: 720 }}>
              A node that has an <strong>incomer</strong> device uses that reading alone as its total.
              Otherwise every <strong>feeder</strong> in its branch is summed. Without this rule a main
              panel and its sub-panels would both be counted, doubling the energy.
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: 14 }}>
              {editId ? 'Update' : 'Save'}
            </button>
          </form>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Address</th><th>Type</th><th>Gateway</th>
                <th>Asset Location</th><th>Role</th><th></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td>{d.address}</td>
                  <td>{d.deviceType ? d.deviceType.name : '—'}</td>
                  <td>{d.dataGateway ? d.dataGateway.name : '—'}</td>
                  <td>
                    {d.asset_node_id ? nodeName(d.asset_node_id)
                      : <span style={{ color: '#e67e22' }}>not placed</span>}
                  </td>
                  <td style={{ color: d.role === 'excluded' ? '#95a5a6' : undefined }}>{d.role || 'feeder'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary" style={{ marginRight: 6, padding: '4px 12px', fontSize: 12 }}
                      onClick={() => edit(d)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => remove(d.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {devices.length === 0 ? (
                <tr><td colSpan="7" style={{ color: '#95a5a6' }}>No devices yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SettingsDevice;
