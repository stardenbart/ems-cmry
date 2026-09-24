import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { tampilSatuan } from '../components/Common/MetricPanel';

// Perakit aturan alarm. Parameter yang bisa dipilih diambil dari metadata device,
// jadi sensor jenis apa pun langsung bisa dijadikan alarm tanpa perubahan kode.

const OPERATOR = ['>', '>=', '<', '<=', '==', '!='];
const SEVERITY = [
  { key: 'info', label: 'Info', warna: '#2980b9' },
  { key: 'warning', label: 'Warning', warna: '#e67e22' },
  { key: 'critical', label: 'Critical', warna: '#c0392b' },
];

const KOSONG = {
  name: '', device_id: '', asset_node_id: '', parameter: '',
  operator: '>', threshold: '', hold_seconds: 60, severity: 'warning',
  enabled: true, active_from: '', active_to: '', recipients: '', email_template: 'default',
};

function SettingsAlarmRules() {
  const [rules, setRules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [params, setParams] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(KOSONG);
  const [editId, setEditId] = useState(null);
  const [pesan, setPesan] = useState('');

  const muat = useCallback(() => {
    api.get('/alarms/rules').then((r) => setRules(r.data)).catch(() => {});
    api.get('/alarms/events?limit=50').then((r) => setEvents(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    muat();
    api.get('/devices').then((r) => setDevices(r.data)).catch(() => {});
    api.get('/assets/tree').then((r) => setNodes(r.data)).catch(() => {});
    api.get('/alarms/templates').then((r) => setTemplates(r.data)).catch(() => {});
    const t = setInterval(muat, 15000);
    return () => clearInterval(t);
  }, [muat]);

  // Daftar parameter mengikuti device yang dipilih. Untuk aturan bertingkat node,
  // dipakai device pertama sebagai contoh nama parameternya.
  useEffect(() => {
    const id = form.device_id || (devices[0] && devices[0].id);
    if (!id) return;
    api.get(`/devices/${id}/parameters`)
      .then((r) => setParams(r.data.parameters))
      .catch(() => setParams([]));
  }, [form.device_id, devices]);

  const ubah = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const simpan = async () => {
    setPesan('');
    const body = {
      ...form,
      device_id: form.device_id ? Number(form.device_id) : null,
      asset_node_id: form.asset_node_id ? Number(form.asset_node_id) : null,
      threshold: Number(form.threshold),
      hold_seconds: Number(form.hold_seconds),
      active_from: form.active_from || null,
      active_to: form.active_to || null,
    };
    try {
      if (editId) await api.put(`/alarms/rules/${editId}`, body);
      else await api.post('/alarms/rules', body);
      setForm(KOSONG); setEditId(null); muat();
    } catch (e) {
      setPesan(e.response?.data?.error || 'Failed to save');
    }
  };

  const sunting = (r) => {
    setEditId(r.id);
    setForm({
      ...KOSONG, ...r,
      device_id: r.device_id || '', asset_node_id: r.asset_node_id || '',
      active_from: r.active_from || '', active_to: r.active_to || '',
      recipients: r.recipients || '',
    });
  };

  const hapus = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try { await api.delete(`/alarms/rules/${id}`); muat(); }
    catch (e) { setPesan(e.response?.data?.error || 'Failed to delete'); }
  };

  const akui = async (id) => {
    try { await api.post(`/alarms/events/${id}/ack`, {}); muat(); }
    catch (e) { setPesan(e.response?.data?.error || 'Failed to acknowledge'); }
  };

  const aktif = events.filter((e) => !e.cleared_at);
  const warnaSeverity = (s) => (SEVERITY.find((x) => x.key === s) || {}).warna || '#7f8c8d';

  return (
    <div>
      <h2 className="page-title">Alarm Rules</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: '#c0392b' }}>{pesan}</div>
      ) : null}

      {/* Alarm yang sedang menyala */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Active alarms ({aktif.length})
        </div>
        {aktif.length === 0 ? (
          <div style={{ color: '#95a5a6', fontSize: 13 }}>No active alarms.</div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Time</th><th>Rule</th><th>Device</th><th>Value</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {aktif.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.started_at).toLocaleString('id-ID')}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: 4,
                        background: warnaSeverity(e.severity), marginRight: 6,
                      }} />
                      {e.rule_name}
                    </td>
                    <td>{e.device_name}</td>
                    <td>{Number(e.value).toFixed(2)} (threshold {Number(e.threshold).toFixed(2)})</td>
                    <td>{e.acknowledged_at ? `acknowledged by ${e.acknowledged_by}` : 'not acknowledged'}</td>
                    <td>
                      {!e.acknowledged_at ? (
                        <button onClick={() => akui(e.id)} className="btn btn-outline btn-sm">
                          Acknowledge
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Perakit aturan */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          {editId ? `Edit rule #${editId}` : 'New rule'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <label style={{ fontSize: 12 }}>Name
            <input value={form.name} onChange={(e) => ubah('name', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
          </label>

          <label style={{ fontSize: 12 }}>Device
            <select value={form.device_id} onChange={(e) => { ubah('device_id', e.target.value); ubah('asset_node_id', ''); }}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              <option value="">— select device —</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12 }}>or Asset node
            <select value={form.asset_node_id} onChange={(e) => { ubah('asset_node_id', e.target.value); ubah('device_id', ''); }}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              <option value="">— select node —</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12 }}>Parameter
            <select value={form.parameter} onChange={(e) => ubah('parameter', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              <option value="">— select parameter —</option>
              {params.map((p) => <option key={p.name} value={p.name}>{p.label || p.name}{tampilSatuan(p.unit) ? ` (${tampilSatuan(p.unit)})` : ''}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12 }}>Condition
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <select value={form.operator} onChange={(e) => ubah('operator', e.target.value)} style={{ padding: 6 }}>
                {OPERATOR.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <input type="number" step="any" value={form.threshold} placeholder="threshold"
                onChange={(e) => ubah('threshold', e.target.value)} style={{ flex: 1, padding: 6 }} />
            </div>
          </label>

          <label style={{ fontSize: 12 }}>Hold time (seconds)
            <input type="number" min="0" value={form.hold_seconds}
              onChange={(e) => ubah('hold_seconds', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
            <span style={{ fontSize: 11, color: '#7f8c8d' }}>condition must hold this long</span>
          </label>

          <label style={{ fontSize: 12 }}>Severity
            <select value={form.severity} onChange={(e) => ubah('severity', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              {SEVERITY.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12 }}>Active from
            <input type="time" value={form.active_from} onChange={(e) => ubah('active_from', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
          </label>

          <label style={{ fontSize: 12 }}>Active until
            <input type="time" value={form.active_to} onChange={(e) => ubah('active_to', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
            <span style={{ fontSize: 11, color: '#7f8c8d' }}>leave empty = always active</span>
          </label>

          <label style={{ fontSize: 12 }}>Email recipients
            <input value={form.recipients} placeholder="a@x.com, b@x.com"
              onChange={(e) => ubah('recipients', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
          </label>

          <label style={{ fontSize: 12 }}>Email template
            <select value={form.email_template} onChange={(e) => ubah('email_template', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
            <input type="checkbox" checked={!!form.enabled} onChange={(e) => ubah('enabled', e.target.checked)} />
            Enabled
          </label>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button onClick={simpan} className="btn btn-primary">
            {editId ? 'Save changes' : 'Add rule'}
          </button>
          {editId ? (
            <button onClick={() => { setEditId(null); setForm(KOSONG); }}
              className="btn btn-outline">Cancel</button>
          ) : null}
        </div>
      </div>

      {/* Rule list */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Rules ({rules.length})
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Target</th><th>Condition</th><th>Hold</th>
                <th>Window</th><th>Severity</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.device_name || r.node_name || '-'}</td>
                  <td>{r.parameter} {r.operator} {r.threshold}</td>
                  <td>{r.hold_seconds}s</td>
                  <td>{r.active_from ? `${r.active_from}–${r.active_to}` : 'always'}</td>
                  <td style={{ color: warnaSeverity(r.severity) }}>{r.severity}</td>
                  <td>{r.enabled ? 'enabled' : 'disabled'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => sunting(r)} className="btn btn-outline btn-sm" style={{ marginRight: 6 }}>Edit</button>
                    <button onClick={() => hapus(r.id)} className="btn btn-danger btn-sm">Delete</button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 ? (
                <tr><td colSpan="8" style={{ color: '#95a5a6' }}>No rules yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SettingsAlarmRules;
