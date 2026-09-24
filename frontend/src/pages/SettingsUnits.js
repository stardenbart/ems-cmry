import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { tampilSatuan } from '../components/Common/MetricPanel';

// Editor satuan. Nilai di database disimpan mentah dan dikonversi saat dibaca,
// jadi membetulkan faktor di sini otomatis membetulkan seluruh riwayat.
//
//   base = value x factor + offset
//
// offset ada karena suhu bukan sekadar perkalian: K ke degC perlu -273,15.

const KOSONG = { symbol: '', name: '', quantity: '', base_symbol: '', factor: 1, offset_value: 0 };

function SettingsUnits() {
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(KOSONG);
  const [editId, setEditId] = useState(null);
  const [pesan, setPesan] = useState('');
  const [gagal, setGagal] = useState(false);
  const [uji, setUji] = useState({ value: 1, from: '', to: '' });

  const muat = useCallback(() => {
    api.get('/settings/units').then((r) => setUnits(r.data)).catch(() => { setGagal(true); setPesan('Failed to load units'); });
  }, []);
  useEffect(() => { muat(); }, [muat]);

  const kelompok = useMemo(() => {
    const m = {};
    units.forEach((u) => { (m[u.quantity] = m[u.quantity] || []).push(u); });
    return m;
  }, [units]);

  const quantities = Object.keys(kelompok).sort();

  const simpan = async () => {
    setPesan('');
    const body = { ...form, factor: Number(form.factor), offset_value: Number(form.offset_value) };
    if (!body.symbol || !body.name || !body.quantity || !body.base_symbol) {
      setGagal(true); setPesan('Symbol, name, quantity and base unit are required'); return;
    }
    if (!Number.isFinite(body.factor) || body.factor === 0) {
      setGagal(true); setPesan('Factor must be a non-zero number'); return;
    }
    try {
      if (editId) await api.put(`/settings/units/${editId}`, body);
      else await api.post('/settings/units', body);
      setGagal(false); setPesan(editId ? `Saved ${body.symbol}` : `Added ${body.symbol}`);
      setForm(KOSONG); setEditId(null); muat();
    } catch (e) { setGagal(true); setPesan(e.response?.data?.error || 'Failed to save'); }
  };

  const hapus = async (u) => {
    if (!window.confirm(`Delete unit ${u.symbol}?`)) return;
    try { await api.delete(`/settings/units/${u.id}`); muat(); }
    catch (e) { setGagal(true); setPesan(e.response?.data?.error || 'Failed to delete'); }
  };

  // Konversi uji: ke satuan dasar, lalu ke satuan tujuan. Hanya antar satuan
  // dengan satuan dasar yang sama — kWh ke degC tidak bermakna.
  const hasilUji = (() => {
    const a = units.find((u) => String(u.id) === String(uji.from));
    const b = units.find((u) => String(u.id) === String(uji.to));
    const v = Number(uji.value);
    if (!a || !b || !Number.isFinite(v)) return null;
    if (a.base_symbol !== b.base_symbol) return 'different base units — not convertible';
    const dasar = v * Number(a.factor) + Number(a.offset_value);
    const tujuan = (dasar - Number(b.offset_value)) / Number(b.factor);
    return `${v} ${tampilSatuan(a.symbol)} = ${Number(tujuan.toPrecision(10))} ${tampilSatuan(b.symbol)}`;
  })();

  const label = { fontSize: 12 };
  const input = { display: 'block', padding: 6, marginTop: 4 };

  return (
    <div>
      <h2 className="page-title">Units</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: gagal ? '#c0392b' : '#1e8449' }}>{pesan}</div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
          {editId ? `Edit unit #${editId}` : 'New unit'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={label}>Symbol
            <input value={form.symbol} placeholder="e.g. bar" onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
              style={{ ...input, width: 90 }} />
          </label>
          <label style={label}>Name
            <input value={form.name} placeholder="e.g. Bar" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ ...input, minWidth: 160 }} />
          </label>
          <label style={label}>Quantity
            <input list="unit-quantities" value={form.quantity} placeholder="e.g. pressure"
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} style={{ ...input, minWidth: 140 }} />
            <datalist id="unit-quantities">{quantities.map((q) => <option key={q} value={q} />)}</datalist>
          </label>
          <label style={label}>Base unit
            <input list="unit-bases" value={form.base_symbol} placeholder="e.g. Pa"
              onChange={(e) => setForm((f) => ({ ...f, base_symbol: e.target.value }))} style={{ ...input, width: 90 }} />
            <datalist id="unit-bases">
              {[...new Set(units.map((u) => u.base_symbol))].map((b) => <option key={b} value={b} />)}
            </datalist>
          </label>
          <label style={label}>Factor
            <input type="number" step="any" value={form.factor}
              onChange={(e) => setForm((f) => ({ ...f, factor: e.target.value }))} style={{ ...input, width: 120 }} />
          </label>
          <label style={label}>Offset
            <input type="number" step="any" value={form.offset_value}
              onChange={(e) => setForm((f) => ({ ...f, offset_value: e.target.value }))} style={{ ...input, width: 100 }} />
          </label>
          <button className="btn btn-primary" onClick={simpan}>{editId ? 'Save' : 'Add'}</button>
          {editId ? <button className="btn btn-outline" onClick={() => { setEditId(null); setForm(KOSONG); }}>Cancel</button> : null}
        </div>
        <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 10 }}>
          base = value × factor + offset. Example: bar → Pa has factor 100000, offset 0; K → degC has factor 1, offset −273.15.
          Readings are stored raw, so correcting a factor here corrects the whole history.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>Try a conversion</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="number" step="any" value={uji.value} onChange={(e) => setUji((u) => ({ ...u, value: e.target.value }))}
            style={{ padding: 6, width: 110 }} />
          <select value={uji.from} onChange={(e) => setUji((u) => ({ ...u, from: e.target.value }))} style={{ padding: 6 }}>
            <option value="">from…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{tampilSatuan(u.symbol)} ({u.quantity})</option>)}
          </select>
          <span>→</span>
          <select value={uji.to} onChange={(e) => setUji((u) => ({ ...u, to: e.target.value }))} style={{ padding: 6 }}>
            <option value="">to…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{tampilSatuan(u.symbol)} ({u.quantity})</option>)}
          </select>
          {hasilUji ? <strong style={{ color: '#1B4F72' }}>{hasilUji}</strong> : null}
        </div>
      </div>

      {quantities.map((q) => (
        <div className="card" key={q} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1B4F72', marginBottom: 8, textTransform: 'capitalize' }}>
            {q.replace(/_/g, ' ')}
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Symbol</th><th>Name</th><th>Base</th><th style={{ textAlign: 'right' }}>Factor</th>
                  <th style={{ textAlign: 'right' }}>Offset</th><th>Kind</th><th></th></tr>
              </thead>
              <tbody>
                {kelompok[q].map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{tampilSatuan(u.symbol)}
                      {tampilSatuan(u.symbol) !== u.symbol ? <code style={{ fontSize: 10, color: '#95a5a6', marginLeft: 6 }}>{u.symbol}</code> : null}
                    </td>
                    <td>{u.name}</td>
                    <td>{tampilSatuan(u.base_symbol)}</td>
                    <td style={{ textAlign: 'right' }}>{Number(u.factor)}</td>
                    <td style={{ textAlign: 'right' }}>{Number(u.offset_value)}</td>
                    <td style={{ color: '#7f8c8d' }}>{u.is_system ? 'built-in' : 'custom'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-outline btn-sm" style={{ marginRight: 6 }}
                        onClick={() => {
                          setEditId(u.id);
                          setForm({ symbol: u.symbol, name: u.name, quantity: u.quantity, base_symbol: u.base_symbol,
                            factor: u.factor, offset_value: u.offset_value });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}>Edit</button>
                      {!u.is_system ? <button className="btn btn-danger btn-sm" onClick={() => hapus(u)}>Delete</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default SettingsUnits;
