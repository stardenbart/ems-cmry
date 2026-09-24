import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

// Data Mapping.
//
// Jumlah parameter TIDAK dibatasi. Versi sebelumnya menulis Array(24) secara
// keras sehingga form selalu tepat 24 baris dan parameter ke-25 mustahil
// ditambahkan, padahal database dan backend tidak pernah membatasi.
//
// Seluruh metadata semantik bisa disunting di sini. Tanpa itu, unit, kind, agg,
// dan batas kewajaran hanya bisa diubah lewat database — bertentangan dengan
// tujuan sistem ini.

const DATA_TYPE = ['float32be', 'int16', 'uint16', 'int32', 'int64-be'];
const AGG = [
  { key: 'gauge', label: 'gauge — nilai sesaat, dirata-rata' },
  { key: 'counter', label: 'counter — akumulator, dijumlah selisihnya' },
];
const POLL_CLASS = [
  { key: 'fast', label: 'fast — tiap siklus' },
  { key: 'normal', label: 'normal — tiap 2 siklus' },
  { key: 'slow', label: 'slow — tiap 10 siklus' },
];
const CONV_MODE = [
  { key: 'none', label: 'none — angka perangkat apa adanya' },
  { key: 'template', label: 'template — pakai satuan standar' },
  { key: 'manual', label: 'manual — skala dan offset sendiri' },
];
const KIND = ['energy', 'power', 'reactive_power', 'apparent_power', 'current', 'voltage',
  'frequency', 'power_factor', 'thd', 'temperature', 'pressure', 'flow', 'other'];

const PARAM_BARU = {
  name: '', address: '', length: 2, dataType: 'float32be', save: true,
  kind: 'other', unit: '-', agg: 'gauge', precision: 2,
  conv_mode: 'none', scale: 1, offset: 0,
  min: null, max: null, featured: false, order: 999, poll_class: 'normal',
};

function SettingsDataMapping() {
  const [types, setTypes] = useState([]);
  const [units, setUnits] = useState([]);
  const [gateways, setGateways] = useState([]);
  const [form, setForm] = useState({ name: '', category: 'Power Meter', params: [] });
  const [editId, setEditId] = useState(null);
  const [tampilForm, setTampilForm] = useState(false);
  const [rinci, setRinci] = useState({});
  const [probe, setProbe] = useState({ gatewayId: '', slaveId: 1, hasil: {} });
  const [pesan, setPesan] = useState('');

  const muat = useCallback(() => {
    api.get('/settings/device-types').then((r) => setTypes(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    muat();
    api.get('/settings/units').then((r) => setUnits(r.data)).catch(() => {});
    api.get('/settings/gateways')
      .then((r) => {
        setGateways(r.data);
        if (r.data.length > 0) setProbe((p) => ({ ...p, gatewayId: r.data[0].id }));
      })
      .catch(() => {});
  }, [muat]);

  const ubahParam = (i, field, value) => {
    setForm((f) => {
      const p = [...f.params];
      p[i] = { ...p[i], [field]: value };
      return { ...f, params: p };
    });
  };

  const tambahBaris = () => setForm((f) => ({
    ...f,
    params: [...f.params, { ...PARAM_BARU, order: f.params.length }],
  }));

  const hapusBaris = (i) => setForm((f) => ({ ...f, params: f.params.filter((_, x) => x !== i) }));

  const pindah = (i, arah) => setForm((f) => {
    const j = i + arah;
    if (j < 0 || j >= f.params.length) return f;
    const p = [...f.params];
    [p[i], p[j]] = [p[j], p[i]];
    return { ...f, params: p };
  });

  const bacaSekarang = async (i) => {
    const p = form.params[i];
    if (!probe.gatewayId || p.address === '' || p.address === null) {
      setPesan('pilih gateway dan isi alamat dulu');
      return;
    }
    setPesan('');
    try {
      const r = await api.post('/settings/probe-register', {
        gatewayId: Number(probe.gatewayId),
        slaveId: Number(probe.slaveId),
        address: Number(p.address),
        length: Number(p.length) || 2,
      });
      setProbe((s) => ({ ...s, hasil: { ...s.hasil, [i]: r.data.decoded } }));
    } catch (e) {
      setPesan(e.response?.data?.error || 'gagal membaca register');
    }
  };

  const simpan = async (e) => {
    e.preventDefault();
    setPesan('');
    const payload = {
      name: form.name,
      category: form.category,
      params: form.params
        .filter((p) => String(p.name).trim() !== '')
        .map((p, i) => ({
          ...p,
          address: parseInt(p.address) || 0,
          length: parseInt(p.length) || 2,
          precision: p.precision === '' || p.precision === null ? 2 : Number(p.precision),
          scale: p.scale === '' || p.scale === null ? 1 : Number(p.scale),
          offset: p.offset === '' || p.offset === null ? 0 : Number(p.offset),
          min: p.min === '' || p.min === null || p.min === undefined ? null : Number(p.min),
          max: p.max === '' || p.max === null || p.max === undefined ? null : Number(p.max),
          order: p.order === '' || p.order === null ? i : Number(p.order),
        })),
    };
    if (payload.params.length === 0) { setPesan('minimal satu parameter dengan nama'); return; }

    try {
      if (editId) await api.put(`/settings/device-types/${editId}`, payload);
      else await api.post('/settings/device-types', payload);
      setTampilForm(false); setEditId(null); setProbe((p) => ({ ...p, hasil: {} }));
      muat();
    } catch (err) { setPesan(err.response?.data?.error || 'gagal menyimpan'); }
  };

  const sunting = (dt) => {
    const params = typeof dt.params === 'string' ? JSON.parse(dt.params) : (dt.params || []);
    setForm({
      name: dt.name, category: dt.category,
      params: params.map((p) => ({ ...PARAM_BARU, ...p })),
    });
    setEditId(dt.id); setTampilForm(true); setRinci({}); setProbe((p) => ({ ...p, hasil: {} }));
  };

  const baru = () => {
    setForm({ name: '', category: 'Power Meter', params: [{ ...PARAM_BARU, order: 0 }] });
    setEditId(null); setTampilForm(true); setRinci({}); setProbe((p) => ({ ...p, hasil: {} }));
  };

  const hapusType = async (id) => {
    if (!window.confirm('Yakin hapus device type ini?')) return;
    try { await api.delete(`/settings/device-types/${id}`); muat(); }
    catch (e) { setPesan(e.response?.data?.error || 'gagal menghapus'); }
  };

  const eksporType = (id) => {
    window.open(`${api.defaults.baseURL}/settings/device-types/${id}/export`, '_blank');
  };

  const imporType = async (ev) => {
    const berkas = ev.target.files[0];
    if (!berkas) return;
    setPesan('');
    try {
      const isi = JSON.parse(await berkas.text());
      await api.post('/settings/device-types/import', { ...isi, overwrite: true });
      muat();
      setPesan(`template "${isi.name}" berhasil diimpor`);
    } catch (e) {
      const d = e.response?.data;
      setPesan(d?.errors ? `${d.error}: ${d.errors.slice(0, 3).join('; ')}` : (d?.error || 'berkas tidak sah'));
    }
    ev.target.value = '';
  };

  const sel = { padding: 4, fontSize: 12, width: '100%' };

  return (
    <div>
      <h2 className="page-title">Data Mapping</h2>

      {pesan ? (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: '#c0392b' }}>{pesan}</div>
      ) : null}

      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={tampilForm ? () => setTampilForm(false) : baru}>
            {tampilForm ? 'Batal' : 'Tambah Data Mapping'}
          </button>
          <label className="btn" style={{ cursor: 'pointer', border: '1px solid #ddd', padding: '6px 14px', borderRadius: 4, fontSize: 13 }}>
            Impor template
            <input type="file" accept="application/json" onChange={imporType} style={{ display: 'none' }} />
          </label>
        </div>

        {tampilForm && (
          <form onSubmit={simpan} style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <label style={{ fontSize: 12 }}>Device Type
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 180 }} />
              </label>
              <label style={{ fontSize: 12 }}>Kategori
                <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 150 }} />
              </label>
              <label style={{ fontSize: 12 }}>Gateway untuk uji baca
                <select value={probe.gatewayId} onChange={(e) => setProbe((p) => ({ ...p, gatewayId: e.target.value }))}
                  style={{ display: 'block', padding: 6, marginTop: 4, minWidth: 150 }}>
                  {gateways.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Slave ID
                <input type="number" min="1" value={probe.slaveId}
                  onChange={(e) => setProbe((p) => ({ ...p, slaveId: e.target.value }))}
                  style={{ display: 'block', padding: 6, marginTop: 4, width: 80 }} />
              </label>
            </div>

            <div className="table-responsive">
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th style={{ minWidth: 180 }}>Nama</th>
                    <th style={{ width: 90 }}>Address</th>
                    <th style={{ width: 60 }}>Len</th>
                    <th style={{ width: 110 }}>Tipe data</th>
                    <th style={{ width: 120 }}>Besaran</th>
                    <th style={{ width: 90 }}>Satuan</th>
                    <th style={{ width: 110 }}>Agregasi</th>
                    <th style={{ width: 50 }}>Simpan</th>
                    <th style={{ width: 50 }}>Utama</th>
                    <th style={{ width: 150 }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {form.params.map((p, i) => (
                    <React.Fragment key={i}>
                      <tr>
                        <td style={{ color: '#95a5a6' }}>{i + 1}</td>
                        <td><input value={p.name} onChange={(e) => ubahParam(i, 'name', e.target.value)} style={sel} /></td>
                        <td><input type="number" value={p.address} onChange={(e) => ubahParam(i, 'address', e.target.value)} style={sel} /></td>
                        <td><input type="number" min="1" max="125" value={p.length} onChange={(e) => ubahParam(i, 'length', e.target.value)} style={sel} /></td>
                        <td>
                          <select value={p.dataType} onChange={(e) => ubahParam(i, 'dataType', e.target.value)} style={sel}>
                            {DATA_TYPE.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={p.kind} onChange={(e) => ubahParam(i, 'kind', e.target.value)} style={sel}>
                            {KIND.map((k) => <option key={k} value={k}>{k}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={p.unit} onChange={(e) => ubahParam(i, 'unit', e.target.value)} style={sel}>
                            {units.map((u) => <option key={u.symbol} value={u.symbol}>{u.symbol}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={p.agg} onChange={(e) => ubahParam(i, 'agg', e.target.value)} style={sel}>
                            {AGG.map((a) => <option key={a.key} value={a.key}>{a.key}</option>)}
                          </select>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={p.save !== false} onChange={(e) => ubahParam(i, 'save', e.target.checked)} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={p.featured === true} onChange={(e) => ubahParam(i, 'featured', e.target.checked)} />
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => bacaSekarang(i)} title="baca register ini dari perangkat"
                            style={{ fontSize: 11, padding: '2px 7px', cursor: 'pointer', marginRight: 3 }}>Baca</button>
                          <button type="button" onClick={() => setRinci((r) => ({ ...r, [i]: !r[i] }))}
                            style={{ fontSize: 11, padding: '2px 7px', cursor: 'pointer', marginRight: 3 }}>
                            {rinci[i] ? '−' : '+'}
                          </button>
                          <button type="button" onClick={() => pindah(i, -1)} style={{ fontSize: 11, padding: '2px 5px', cursor: 'pointer' }}>↑</button>
                          <button type="button" onClick={() => pindah(i, 1)} style={{ fontSize: 11, padding: '2px 5px', cursor: 'pointer' }}>↓</button>
                          <button type="button" onClick={() => hapusBaris(i)}
                            style={{ fontSize: 11, padding: '2px 7px', cursor: 'pointer', color: '#c0392b', marginLeft: 3 }}>×</button>
                        </td>
                      </tr>

                      {probe.hasil[i] ? (
                        <tr>
                          <td colSpan="11" style={{ background: '#f8f9fa', fontSize: 11 }}>
                            Hasil baca alamat {p.address}:{' '}
                            {Object.entries(probe.hasil[i])
                              .filter(([k]) => k !== 'raw')
                              .map(([k, v]) => (
                                <span key={k} style={{ marginRight: 14 }}>
                                  <strong>{k}</strong> = {String(v)}
                                </span>
                              ))}
                            <span style={{ color: '#7f8c8d' }}>— pilih tipe data yang nilainya masuk akal</span>
                          </td>
                        </tr>
                      ) : null}

                      {rinci[i] ? (
                        <tr>
                          <td colSpan="11" style={{ background: '#fbfbfb' }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '6px 0' }}>
                              <label style={{ fontSize: 11 }}>Konversi
                                <select value={p.conv_mode} onChange={(e) => ubahParam(i, 'conv_mode', e.target.value)}
                                  style={{ display: 'block', padding: 4, marginTop: 2, minWidth: 200 }}>
                                  {CONV_MODE.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </select>
                              </label>
                              <label style={{ fontSize: 11 }}>Scale
                                <input type="number" step="any" value={p.scale} onChange={(e) => ubahParam(i, 'scale', e.target.value)}
                                  style={{ display: 'block', padding: 4, marginTop: 2, width: 90 }} />
                              </label>
                              <label style={{ fontSize: 11 }}>Offset
                                <input type="number" step="any" value={p.offset} onChange={(e) => ubahParam(i, 'offset', e.target.value)}
                                  style={{ display: 'block', padding: 4, marginTop: 2, width: 90 }} />
                              </label>
                              <label style={{ fontSize: 11 }}>Min wajar
                                <input type="number" step="any" value={p.min === null ? '' : p.min}
                                  onChange={(e) => ubahParam(i, 'min', e.target.value)}
                                  style={{ display: 'block', padding: 4, marginTop: 2, width: 100 }} />
                              </label>
                              <label style={{ fontSize: 11 }}>Max wajar
                                <input type="number" step="any" value={p.max === null ? '' : p.max}
                                  onChange={(e) => ubahParam(i, 'max', e.target.value)}
                                  style={{ display: 'block', padding: 4, marginTop: 2, width: 100 }} />
                              </label>
                              <label style={{ fontSize: 11 }}>Desimal
                                <input type="number" min="0" max="6" value={p.precision}
                                  onChange={(e) => ubahParam(i, 'precision', e.target.value)}
                                  style={{ display: 'block', padding: 4, marginTop: 2, width: 70 }} />
                              </label>
                              <label style={{ fontSize: 11 }}>Laju baca
                                <select value={p.poll_class} onChange={(e) => ubahParam(i, 'poll_class', e.target.value)}
                                  style={{ display: 'block', padding: 4, marginTop: 2, minWidth: 170 }}>
                                  {POLL_CLASS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </select>
                              </label>
                              <label style={{ fontSize: 11 }}>Urutan
                                <input type="number" value={p.order} onChange={(e) => ubahParam(i, 'order', e.target.value)}
                                  style={{ display: 'block', padding: 4, marginTop: 2, width: 80 }} />
                              </label>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={tambahBaris} style={{ padding: '6px 14px', cursor: 'pointer' }}>
                + Tambah parameter
              </button>
              <span style={{ fontSize: 12, color: '#7f8c8d' }}>
                {form.params.length} baris — tidak ada batas jumlah
              </span>
              <button type="submit" className="btn btn-primary" style={{ marginLeft: 'auto' }}>
                {editId ? 'Simpan perubahan' : 'Simpan'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 8 }}>
              Baris tanpa nama diabaikan saat menyimpan. Perubahan langsung dipakai pada siklus
              pembacaan berikutnya, tanpa restart.
            </div>
          </form>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Device Type</th><th>Kategori</th><th>Parameter</th><th></th></tr></thead>
            <tbody>
              {types.map((dt) => {
                const n = (typeof dt.params === 'string' ? JSON.parse(dt.params) : (dt.params || [])).length;
                return (
                  <tr key={dt.id}>
                    <td style={{ fontWeight: 600 }}>{dt.name}</td>
                    <td>{dt.category}</td>
                    <td>{n}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-primary" style={{ marginRight: 6, padding: '4px 12px', fontSize: 12 }}
                        onClick={() => sunting(dt)}>Ubah</button>
                      <button style={{ marginRight: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                        onClick={() => eksporType(dt.id)}>Ekspor</button>
                      <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: 12 }}
                        onClick={() => hapusType(dt.id)}>Hapus</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SettingsDataMapping;
