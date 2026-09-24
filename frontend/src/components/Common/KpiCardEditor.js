import React, { useState } from 'react';
import api from '../../api/axios';
import { formatNilai } from './MetricPanel';

// Shared KPI card editor, used by both Realtime Diagram and Device Monitor.
//
// Writes back into the device type metadata, so the layout follows the device
// type rather than the page. Only `featured`, `label` and `order` are touched —
// register address and everything else are copied through untouched.
//
// The display name lives in `label`, never in `name`: `name` is the key that
// ties every row in `readings` to its parameter, so renaming it would cut the
// history loose.

function KpiCardEditor({ typeName, parameters, live, onSaved, onClose }) {
  const [draft, setDraft] = useState(() => (parameters || []).map((p) => ({ ...p })));
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const change = (i, field, value) =>
    setDraft((d) => d.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

  const save = async () => {
    setMessage(''); setSaving(true);
    try {
      const types = (await api.get('/settings/device-types')).data;
      const dt = types.find((t) => t.name === typeName);
      if (!dt) { setMessage('Device type not found'); setSaving(false); return; }

      const original = typeof dt.params === 'string' ? JSON.parse(dt.params) : dt.params;
      const byName = {};
      draft.forEach((p) => { byName[p.name] = p; });

      const params = original.map((p) => {
        const u = byName[p.name];
        if (!u) return p;
        return {
          ...p,
          featured: u.featured === true,
          label: u.label ? u.label : undefined,
          order: u.order === '' || u.order === null || u.order === undefined
            ? p.order : Number(u.order),
        };
      });

      await api.put(`/settings/device-types/${dt.id}`, { params });
      setSaving(false);
      if (onSaved) onSaved();
    } catch (e) {
      setSaving(false);
      setMessage(e.response?.data?.error || 'Failed to save card layout');
    }
  };

  const shown = draft.filter((p) => p.featured).length;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase' }}>
          KPI cards — {shown} shown
        </div>
        <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
          Close
        </button>
      </div>

      {message ? <div style={{ color: '#c0392b', fontSize: 12, marginBottom: 8 }}>{message}</div> : null}

      <div className="table-responsive">
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Show</th>
              <th>Parameter</th>
              <th>Card title</th>
              <th style={{ width: 80 }}>Order</th>
              <th style={{ width: 130, textAlign: 'right' }}>Current value</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((p, i) => (
              <tr key={p.name}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={p.featured === true}
                    onChange={(e) => change(i, 'featured', e.target.checked)} />
                </td>
                <td>
                  {p.name}
                  <span style={{ color: '#95a5a6' }}> {p.unit && p.unit !== '-' ? `(${p.unit})` : ''}</span>
                  {p.saved === false ? (
                    <span style={{ color: '#e67e22', fontSize: 11 }}> · not stored</span>
                  ) : null}
                </td>
                <td>
                  <input value={p.label || ''} placeholder={p.name}
                    onChange={(e) => change(i, 'label', e.target.value)}
                    style={{ width: '100%', padding: 4, fontSize: 12 }} />
                </td>
                <td>
                  <input type="number" value={p.order === undefined ? 999 : p.order}
                    onChange={(e) => change(i, 'order', e.target.value)}
                    style={{ width: 70, padding: 4, fontSize: 12 }} />
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {formatNilai(live ? live[p.name] : null, p.precision)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save card layout'}
        </button>
        <span style={{ fontSize: 11, color: '#7f8c8d' }}>
          Saved on the device type, so it applies to every device of type {typeName}.
        </span>
      </div>
    </div>
  );
}

export default KpiCardEditor;
