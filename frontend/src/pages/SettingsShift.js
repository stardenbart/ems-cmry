import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

// Kalender shift dan hari non-produksi.
// Prasyarat untuk laporan dan baseline yang jujur: membandingkan hari kerja
// dengan hari libur tidak bermakna.

const HARI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const JENIS_HARI = [
  { key: 'holiday', label: 'Holiday' },
  { key: 'shutdown', label: 'Shutdown' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'production', label: 'Working day (normally a holiday)' },
];

const SHIFT_KOSONG = { name: '', start_time: '', end_time: '', weekdays: [1, 2, 3, 4, 5, 6], enabled: true };

function SettingsShift() {
  const [shifts, setShifts] = useState([]);
  const [hari, setHari] = useState([]);
  const [form, setForm] = useState(SHIFT_KOSONG);
  const [editId, setEditId] = useState(null);
  const [hariBaru, setHariBaru] = useState({ day: '', kind: 'holiday', note: '' });
  const [pesan, setPesan] = useState('');

  const muat = useCallback(() => {
    api.get('/settings/shifts').then((r) => setShifts(r.data)).catch(() => {});
    api.get('/settings/calendar').then((r) => setHari(r.data)).catch(() => {});
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const toggleHari = (h) => setForm((f) => ({
    ...f,
    weekdays: f.weekdays.includes(h) ? f.weekdays.filter((x) => x !== h) : [...f.weekdays, h].sort(),
  }));

  const simpanShift = async () => {
    setPesan('');
    try {
      if (editId) await api.put(`/settings/shifts/${editId}`, form);
      else await api.post('/settings/shifts', form);
      setForm(SHIFT_KOSONG); setEditId(null); muat();
    } catch (e) { setPesan(e.response?.data?.error || 'Failed to save shift'); }
  };

  const hapusShift = async (id) => {
    if (!window.confirm('Delete this shift?')) return;
    try { await api.delete(`/settings/shifts/${id}`); muat(); }
    catch (e) { setPesan(e.response?.data?.error || 'Failed to delete'); }
  };

  const simpanHari = async () => {
    setPesan('');
    if (!hariBaru.day) { setPesan('date is required'); return; }
    try {
      await api.post('/settings/calendar', hariBaru);
      setHariBaru({ day: '', kind: 'holiday', note: '' });
      muat();
    } catch (e) { setPesan(e.response?.data?.error || 'Failed to save special day'); }
  };

  const hapusHari = async (d) => {
    try { await api.delete(`/settings/calendar/${String(d).slice(0, 10)}`); muat(); }
    catch (e) { setPesan(e.response?.data?.error || 'Failed to delete'); }
  };

  return (
    <div>
      <h2 className="page-title">Shifts & Calendar</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: '#c0392b' }}>{pesan}</div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          {editId ? `Edit shift #${editId}` : 'New shift'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12 }}>Name
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 150 }} />
          </label>
          <label style={{ fontSize: 12 }}>Start
            <input type="time" value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>End
            <input type="time" value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4 }} />
          </label>
          <div style={{ fontSize: 12 }}>Active days
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {HARI.map((h, i) => (
                <button key={h} onClick={() => toggleHari(i)}
                  style={{
                    padding: '5px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 3,
                    border: '1px solid ' + (form.weekdays.includes(i) ? '#1B4F72' : '#ddd'),
                    background: form.weekdays.includes(i) ? '#1B4F72' : '#fff',
                    color: form.weekdays.includes(i) ? '#fff' : '#555',
                  }}>{h}</button>
              ))}
            </div>
          </div>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            Enabled
          </label>
          <button className="btn btn-primary" onClick={simpanShift}>
            {editId ? 'Save' : 'Add'}
          </button>
          {editId ? (
            <button onClick={() => { setEditId(null); setForm(SHIFT_KOSONG); }}
              className="btn btn-outline">Cancel</button>
          ) : null}
        </div>

        <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 10 }}>
          A shift that crosses midnight belongs to the day it starts. 02:00 on a 23:00–07:00 shift
          is counted as the previous day's shift, the way operators count it.
        </div>

        <div className="table-responsive" style={{ marginTop: 14 }}>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Hours</th><th>Days</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                    {String(s.start_time) > String(s.end_time) ? (
                      <span style={{ color: '#e67e22', fontSize: 11 }}> (crosses midnight)</span>
                    ) : null}
                  </td>
                  <td>{s.weekdays && s.weekdays.length ? s.weekdays.map((d) => HARI[d]).join(' ') : 'every day'}</td>
                  <td>{s.enabled ? 'enabled' : 'disabled'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => { setEditId(s.id); setForm({ ...s, weekdays: s.weekdays || [] }); }}
                      className="btn btn-outline btn-sm" style={{ marginRight: 6 }}>Edit</button>
                    <button onClick={() => hapusShift(s.id)}
                      className="btn btn-danger btn-sm">Delete</button>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 ? <tr><td colSpan="5" style={{ color: '#95a5a6' }}>No shifts yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          Special days
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12 }}>Date
            <input type="date" value={hariBaru.day}
              onChange={(e) => setHariBaru((f) => ({ ...f, day: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>Kind
            <select value={hariBaru.kind} onChange={(e) => setHariBaru((f) => ({ ...f, kind: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 220 }}>
              {JENIS_HARI.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, flex: 1, minWidth: 180 }}>Note
            <input value={hariBaru.note} onChange={(e) => setHariBaru((f) => ({ ...f, note: e.target.value }))}
              style={{ display: 'block', padding: 6, marginTop: 4, width: '100%' }} />
          </label>
          <button className="btn btn-primary" onClick={simpanHari}>
            Save
          </button>
        </div>

        <div className="table-responsive" style={{ marginTop: 14 }}>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Kind</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {hari.map((h) => (
                <tr key={h.id}>
                  <td>{String(h.day).slice(0, 10)}</td>
                  <td>{(JENIS_HARI.find((k) => k.key === h.kind) || {}).label || h.kind}</td>
                  <td style={{ color: '#7f8c8d' }}>{h.note || '-'}</td>
                  <td>
                    <button onClick={() => hapusHari(h.day)}
                      className="btn btn-danger btn-sm">Delete</button>
                  </td>
                </tr>
              ))}
              {hari.length === 0 ? <tr><td colSpan="4" style={{ color: '#95a5a6' }}>No special days yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SettingsShift;
