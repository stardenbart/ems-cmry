import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

// Perakit aturan alarm. Parameter yang bisa dipilih diambil dari metadata device,
// jadi sensor jenis apa pun langsung bisa dijadikan alarm tanpa perubahan kode.

const OPERATOR = ['>', '>=', '<', '<=', '==', '!='];
const SEVERITY = [
  { key: 'info', label: 'Info', warna: '#2980b9' },
  { key: 'warning', label: 'Peringatan', warna: '#e67e22' },
  { key: 'critical', label: 'Kritis', warna: '#c0392b' },
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
      setPesan(e.response?.data?.error || 'gagal menyimpan');
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
    if (!window.confirm('Hapus aturan ini?')) return;
    try { await api.delete(`/alarms/rules/${id}`); muat(); }
    catch (e) { setPesan(e.response?.data?.error || 'gagal menghapus'); }
  };

  const akui = async (id) => {
    try { await api.post(`/alarms/events/${id}/ack`, {}); muat(); }
    catch (e) { setPesan(e.response?.data?.error || 'gagal acknowledge'); }
  };

  const aktif = events.filter((e) => !e.cleared_at);
  const warnaSeverity = (s) => (SEVERITY.find((x) => x.key === s) || {}).warna || '#7f8c8d';

  return (
    <div>
      <h2 className="page-title">Aturan Alarm</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: '#c0392b' }}>{pesan}</div>
      ) : null}

      {/* Alarm yang sedang menyala */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Sedang menyala ({aktif.length})
        </div>
        {aktif.length === 0 ? (
          <div style={{ color: '#95a5a6', fontSize: 13 }}>Tidak ada alarm aktif.</div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Waktu</th><th>Aturan</th><th>Device</th><th>Nilai</th><th>Status</th><th></th></tr>
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
                    <td>{Number(e.value).toFixed(2)} (ambang {Number(e.threshold).toFixed(2)})</td>
                    <td>{e.acknowledged_at ? `diakui ${e.acknowledged_by}` : 'belum diakui'}</td>
                    <td>
                      {!e.acknowledged_at ? (
                        <button onClick={() => akui(e.id)} style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>
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
          {editId ? `Ubah aturan #${editId}` : 'Aturan baru'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <label style={{ fontSize: 12 }}>Nama
            <input value={form.name} onChange={(e) => ubah('name', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
          </label>

          <label style={{ fontSize: 12 }}>Device
            <select value={form.device_id} onChange={(e) => { ubah('device_id', e.target.value); ubah('asset_node_id', ''); }}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              <option value="">— pilih device —</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12 }}>atau Node aset
            <select value={form.asset_node_id} onChange={(e) => { ubah('asset_node_id', e.target.value); ubah('device_id', ''); }}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              <option value="">— pilih node —</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12 }}>Parameter
            <select value={form.parameter} onChange={(e) => ubah('parameter', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              <option value="">— pilih parameter —</option>
              {params.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.unit})</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12 }}>Kondisi
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <select value={form.operator} onChange={(e) => ubah('operator', e.target.value)} style={{ padding: 6 }}>
                {OPERATOR.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <input type="number" step="any" value={form.threshold} placeholder="ambang"
                onChange={(e) => ubah('threshold', e.target.value)} style={{ flex: 1, padding: 6 }} />
            </div>
          </label>

          <label style={{ fontSize: 12 }}>Durasi tahan (detik)
            <input type="number" min="0" value={form.hold_seconds}
              onChange={(e) => ubah('hold_seconds', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
            <span style={{ fontSize: 11, color: '#7f8c8d' }}>kondisi harus bertahan selama ini</span>
          </label>

          <label style={{ fontSize: 12 }}>Tingkat
            <select value={form.severity} onChange={(e) => ubah('severity', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              {SEVERITY.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12 }}>Aktif dari
            <input type="time" value={form.active_from} onChange={(e) => ubah('active_from', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
          </label>

          <label style={{ fontSize: 12 }}>Aktif sampai
            <input type="time" value={form.active_to} onChange={(e) => ubah('active_to', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
            <span style={{ fontSize: 11, color: '#7f8c8d' }}>kosongkan = sepanjang waktu</span>
          </label>

          <label style={{ fontSize: 12 }}>Penerima email
            <input value={form.recipients} placeholder="a@x.com, b@x.com"
              onChange={(e) => ubah('recipients', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }} />
          </label>

          <label style={{ fontSize: 12 }}>Template email
            <select value={form.email_template} onChange={(e) => ubah('email_template', e.target.value)}
              style={{ width: '100%', padding: 6, marginTop: 4 }}>
              {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
            <input type="checkbox" checked={!!form.enabled} onChange={(e) => ubah('enabled', e.target.checked)} />
            Aktif
          </label>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button onClick={simpan} style={{ padding: '7px 18px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {editId ? 'Simpan perubahan' : 'Tambah aturan'}
          </button>
          {editId ? (
            <button onClick={() => { setEditId(null); setForm(KOSONG); }}
              style={{ padding: '7px 18px', cursor: 'pointer' }}>Batal</button>
          ) : null}
        </div>
      </div>

      {/* Daftar aturan */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Daftar aturan ({rules.length})
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th><th>Sasaran</th><th>Kondisi</th><th>Tahan</th>
                <th>Jendela</th><th>Tingkat</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.device_name || r.node_name || '-'}</td>
                  <td>{r.parameter} {r.operator} {r.threshold}</td>
                  <td>{r.hold_seconds}s</td>
                  <td>{r.active_from ? `${r.active_from}–${r.active_to}` : 'selalu'}</td>
                  <td style={{ color: warnaSeverity(r.severity) }}>{r.severity}</td>
                  <td>{r.enabled ? 'aktif' : 'nonaktif'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => sunting(r)} style={{ fontSize: 12, padding: '3px 9px', cursor: 'pointer', marginRight: 6 }}>Ubah</button>
                    <button onClick={() => hapus(r.id)} style={{ fontSize: 12, padding: '3px 9px', cursor: 'pointer', color: '#c0392b' }}>Hapus</button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 ? (
                <tr><td colSpan="8" style={{ color: '#95a5a6' }}>Belum ada aturan.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SettingsAlarmRules;
