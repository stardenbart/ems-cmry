import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../api/axios';
import { formatNilai, tampilSatuan } from '../components/Common/MetricPanel';

// Dashboard per jenis besaran.
//
// Daftar halamannya TUMBUH SENDIRI dari data: endpoint /dashboards/kinds
// mengembalikan jenis yang benar-benar punya parameter tersimpan. Memasang
// sensor tekanan atau suhu memunculkan tabnya tanpa deploy.

const RANGE = [
  { key: 'today', label: 'Today' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'thisMonth', label: 'This month' },
];

const LABEL_KIND = {
  energy: 'Energy', power: 'Active Power', reactive_power: 'Reactive Power',
  apparent_power: 'Apparent Power', current: 'Current', voltage: 'Voltage',
  frequency: 'Frequency', power_factor: 'Power Factor', thd: 'THD',
  temperature: 'Temperature', pressure: 'Pressure', flow: 'Flow', other: 'Other',
};

const WARNA = ['#1B4F72', '#e74c3c', '#27ae60', '#e67e22', '#8e44ad', '#16a085', '#2c3e50', '#d35400'];

function DashboardByKind() {
  const [kinds, setKinds] = useState([]);
  const [aktif, setAktif] = useState(null);
  const [range, setRange] = useState('today');
  const [seri, setSeri] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    api.get('/dashboards/kinds')
      .then((r) => {
        setKinds(r.data);
        if (r.data.length > 0) setAktif(r.data[0].kind);
        setStatus('');
      })
      .catch(() => setStatus('Failed to load quantities'));
  }, []);

  const kindAktif = useMemo(() => kinds.find((k) => k.kind === aktif), [kinds, aktif]);

  useEffect(() => {
    if (!kindAktif) return;
    setStatus('loading');
    setSeri([]);

    // Ambil seluruh parameter jenis ini dari semua device. Dibatasi 8 supaya
    // grafik tetap terbaca; sisanya tetap muncul di tabel ringkasan.
    const daftar = kindAktif.items.slice(0, 8);
    Promise.all(daftar.map((it) =>
      api.get('/dashboards/series', {
        params: { device_id: it.deviceId, parameter: it.parameter, range },
      })
        .then((r) => ({ ...it, data: r.data.data || [] }))
        .catch(() => ({ ...it, data: [] }))))
      .then((hasil) => { setSeri(hasil); setStatus(''); })
      .catch(() => setStatus('Failed to load data'));
  }, [kindAktif, range]);

  // Gabungkan seluruh seri ke satu sumbu waktu.
  const chartData = useMemo(() => {
    const peta = {};
    seri.forEach((s) => {
      s.data.forEach((d) => {
        const kunci = d.period;
        peta[kunci] = peta[kunci] || { kunci };
        peta[kunci][`${s.deviceName} — ${s.parameter}`] = Number(d.total);
      });
    });
    return Object.values(peta)
      .sort((a, b) => new Date(a.kunci) - new Date(b.kunci))
      .map((r) => ({
        ...r,
        label: new Date(r.kunci).toLocaleString('id-ID',
          range === 'today' ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short' }),
      }));
  }, [seri, range]);

  const kunciSeri = useMemo(
    () => seri.filter((s) => s.data.length > 0).map((s) => `${s.deviceName} — ${s.parameter}`),
    [seri]);

  const agg = kindAktif && kindAktif.items[0] ? kindAktif.items[0].agg : 'gauge';
  const satuan = kindAktif ? kindAktif.units.map(tampilSatuan).join(', ') : '';

  return (
    <div>
      <h2 className="page-title">Measurement Trends</h2>

      {/* Tab jenis besaran, tumbuh sendiri dari data */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {kinds.map((k) => (
          <button key={k.kind} onClick={() => setAktif(k.kind)}
            style={{
              padding: '6px 14px', fontSize: 13, borderRadius: 4, cursor: 'pointer',
              border: '1px solid ' + (aktif === k.kind ? '#1B4F72' : '#ddd'),
              background: aktif === k.kind ? '#1B4F72' : '#fff',
              color: aktif === k.kind ? '#fff' : '#555',
            }}>
            {LABEL_KIND[k.kind] || k.kind}
            <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>{k.count}</span>
          </button>
        ))}
        {kinds.length === 0 && !status ? (
          <span style={{ color: '#95a5a6', fontSize: 13 }}>No quantity has stored data yet.</span>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>{LABEL_KIND[aktif] || aktif}</strong>
          <span style={{ fontSize: 12, color: '#7f8c8d' }}>
            unit {satuan} · {agg === 'counter' ? 'accumulated per period' : 'average per period'}
          </span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {RANGE.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)}
                style={{
                  padding: '5px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                  border: '1px solid ' + (range === r.key ? '#1B4F72' : '#ddd'),
                  background: range === r.key ? '#1B4F72' : '#fff',
                  color: range === r.key ? '#fff' : '#555',
                }}>{r.label}</button>
            ))}
          </div>
        </div>

        {status ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#95a5a6' }}>{status}</div>
        ) : kunciSeri.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#95a5a6' }}>
            No data in this range yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            {agg === 'counter' ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: '#7f8c8d' }} interval="preserveStartEnd" />
                <YAxis fontSize={11} tick={{ fill: '#7f8c8d' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {kunciSeri.map((k, i) => (
                  <Bar key={k} dataKey={k} fill={WARNA[i % WARNA.length]} />
                ))}
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: '#7f8c8d' }} interval="preserveStartEnd" />
                <YAxis fontSize={11} tick={{ fill: '#7f8c8d' }} domain={['auto', 'auto']} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {kunciSeri.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} stroke={WARNA[i % WARNA.length]}
                    strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Ringkasan seluruh parameter jenis ini */}
      {kindAktif ? (
        <div className="card">
          <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
            {LABEL_KIND[aktif] || aktif} parameters ({kindAktif.items.length})
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Device</th><th>Parameter</th><th>Unit</th><th>Aggregation</th><th style={{ textAlign: 'right' }}>Period value</th></tr>
              </thead>
              <tbody>
                {kindAktif.items.map((it) => {
                  const s = seri.find((x) => x.deviceId === it.deviceId && x.parameter === it.parameter);
                  let nilai = null;
                  if (s && s.data.length > 0) {
                    nilai = it.agg === 'counter'
                      ? s.data.reduce((t, d) => t + Number(d.total), 0)
                      : s.data.reduce((t, d) => t + Number(d.total), 0) / s.data.length;
                  }
                  return (
                    <tr key={`${it.deviceId}-${it.parameter}`}>
                      <td>{it.deviceName}</td>
                      <td>{it.parameter}</td>
                      <td>{tampilSatuan(it.unit)}</td>
                      <td style={{ color: '#7f8c8d' }}>{it.agg === 'counter' ? 'sum' : 'average'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {nilai === null ? '—' : formatNilai(nilai, it.precision)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {kindAktif.items.length > 8 ? (
            <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 8 }}>
              The chart shows the first 8 parameters to stay readable; the table lists all of them.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default DashboardByKind;
