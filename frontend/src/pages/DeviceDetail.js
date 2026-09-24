import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import api from '../api/axios';
import { useWebSocket } from '../hooks/useWebSocket';
import DeviceSelector from '../components/Common/DeviceSelector';
import MetricPanel, { formatNilai } from '../components/Common/MetricPanel';

// Halaman device yang berlaku untuk perangkat apa pun.
//
// Tidak ada satu pun nama parameter yang ditulis di sini. Panel dipilih dari
// metadata kind dan agg, sehingga power meter, sensor tekanan, dan recorder suhu
// tampil dengan benar tanpa halaman baru.

const RANGE = [
  { key: 'today', label: 'Hari ini' },
  { key: 'thisWeek', label: 'Minggu ini' },
  { key: 'thisMonth', label: 'Bulan ini' },
];

const LABEL_KIND = {
  energy: 'Energi', power: 'Daya Aktif', reactive_power: 'Daya Reaktif',
  apparent_power: 'Daya Semu', current: 'Arus', voltage: 'Tegangan',
  frequency: 'Frekuensi', power_factor: 'Power Factor', thd: 'THD',
  temperature: 'Suhu', pressure: 'Tekanan', flow: 'Aliran', other: 'Lainnya',
};

function DeviceDetail() {
  const [deviceId, setDeviceId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [terpilih, setTerpilih] = useState(null);
  const [range, setRange] = useState('today');
  const [series, setSeries] = useState(null);
  const [pesan, setPesan] = useState('');
  const [aturKartu, setAturKartu] = useState(false);
  const [draf, setDraf] = useState([]);

  const { data: wsData, isConnected } = useWebSocket();

  useEffect(() => {
    api.get('/devices')
      .then((res) => { if (res.data.length > 0) setDeviceId(res.data[0].id); })
      .catch(() => setPesan('gagal memuat daftar device'));
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    setMeta(null); setSeries(null);
    api.get(`/devices/${deviceId}/parameters`)
      .then((res) => {
        setMeta(res.data);
        const awal = res.data.parameters.find((p) => p.saved) || res.data.parameters[0];
        setTerpilih(awal ? awal.name : null);
      })
      .catch((e) => setPesan(e.response?.data?.error || 'gagal memuat parameter'));
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId || !terpilih) return;
    setSeries(null);
    api.get('/dashboards/series', { params: { device_id: deviceId, parameter: terpilih, range } })
      .then((res) => setSeries(res.data))
      .catch(() => setSeries({ data: [], gagal: true }));
  }, [deviceId, terpilih, range]);

  const live = deviceId && wsData[deviceId] ? wsData[deviceId] : {};

  const paramTerpilih = useMemo(
    () => (meta ? meta.parameters.find((p) => p.name === terpilih) : null),
    [meta, terpilih]);

  const chartData = useMemo(() => {
    if (!series || !series.data) return [];
    return series.data.map((d) => ({
      label: new Date(d.period).toLocaleString('id-ID',
        range === 'today' ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short' }),
      nilai: Number(d.total),
    }));
  }, [series, range]);

  // Simpan susunan kartu kembali ke device type. Yang diubah hanya featured,
  // label, dan order — sisanya disalin apa adanya supaya alamat register dan
  // metadata lain tidak tersentuh.
  const simpanKartu = async () => {
    setPesan('');
    try {
      const dt = (await api.get('/settings/device-types')).data
        .find((t) => t.name === meta.typeName);
      if (!dt) { setPesan('device type tidak ditemukan'); return; }

      const asli = typeof dt.params === 'string' ? JSON.parse(dt.params) : dt.params;
      const ubah = {};
      draf.forEach((p) => { ubah[p.name] = p; });

      const params = asli.map((p) => {
        const u = ubah[p.name];
        if (!u) return p;
        return {
          ...p,
          featured: u.featured === true,
          label: u.label || undefined,
          order: u.order === '' || u.order === null ? p.order : Number(u.order),
        };
      });

      await api.put(`/settings/device-types/${dt.id}`, { params });
      const r = await api.get(`/devices/${deviceId}/parameters`);
      setMeta(r.data);
      setAturKartu(false);
    } catch (e) {
      setPesan(e.response?.data?.error || 'gagal menyimpan susunan kartu');
    }
  };

  const utama = meta ? meta.parameters.filter((p) => p.featured) : [];
  const lainnya = meta ? meta.parameters.filter((p) => !p.featured) : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <h2 className="page-title" style={{ margin: 0 }}>Device</h2>
        <span style={{ fontSize: 12 }} className={isConnected ? 'status-connected' : 'status-disconnected'}>
          {isConnected ? 'Terhubung' : 'Terputus'}
        </span>
      </div>

      <div className="card" style={{ padding: '12px 20px', marginBottom: 16 }}>
        <DeviceSelector value={deviceId} onChange={setDeviceId} label="Pilih Device" />
        {meta ? (
          <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 8 }}>
            {meta.typeName} · alamat {meta.address} · peran {meta.role} · {meta.parameters.length} parameter
          </div>
        ) : null}
      </div>

      {pesan ? <div className="card" style={{ padding: 20, color: '#c0392b' }}>{pesan}</div> : null}

      {/* Pengatur kartu KPI: pilih parameter mana yang tampil dan namanya apa */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={() => { setDraf(meta ? meta.parameters.map((p) => ({ ...p })) : []); setAturKartu(!aturKartu); }}
          style={{ fontSize: 12, padding: '5px 12px', cursor: 'pointer' }}>
          {aturKartu ? 'Tutup pengaturan kartu' : 'Atur kartu KPI'}
        </button>
      </div>

      {aturKartu ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 10 }}>
            Kartu KPI yang ditampilkan
          </div>
          <div className="table-responsive">
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr><th style={{ width: 60 }}>Tampil</th><th>Parameter</th><th>Nama di kartu</th>
                  <th style={{ width: 80 }}>Urutan</th><th style={{ width: 120 }}>Nilai sekarang</th></tr>
              </thead>
              <tbody>
                {draf.map((p, i) => (
                  <tr key={p.name}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={p.featured === true}
                        onChange={(e) => setDraf((d) => d.map((x, j) => j === i ? { ...x, featured: e.target.checked } : x))} />
                    </td>
                    <td>{p.name} <span style={{ color: '#95a5a6' }}>({p.unit})</span></td>
                    <td>
                      <input value={p.label || ''} placeholder={p.name}
                        onChange={(e) => setDraf((d) => d.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                        style={{ width: '100%', padding: 4, fontSize: 12 }} />
                    </td>
                    <td>
                      <input type="number" value={p.order === undefined ? 999 : p.order}
                        onChange={(e) => setDraf((d) => d.map((x, j) => j === i ? { ...x, order: e.target.value } : x))}
                        style={{ width: 70, padding: 4, fontSize: 12 }} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNilai(live[p.name], p.precision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={simpanKartu}
              style={{ padding: '7px 16px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Simpan susunan kartu
            </button>
            <span style={{ fontSize: 11, color: '#7f8c8d' }}>
              Tersimpan di Data Mapping device type ini, jadi berlaku untuk semua device bertipe sama.
            </span>
          </div>
        </div>
      ) : null}

      {/* Kartu utama, dipilih dari flag featured di Data Mapping */}
      {utama.length > 0 ? (
        <div className="rt-grid-4">
          {utama.map((p) => (
            <MetricPanel key={p.name} meta={{ ...p, label: p.label || p.name }} value={live[p.name]} />
          ))}
        </div>
      ) : null}

      {/* Grafik satu parameter, rumusnya mengikuti agg milik parameter itu */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <select value={terpilih || ''} onChange={(e) => setTerpilih(e.target.value)}
            style={{ padding: 6, fontSize: 13, minWidth: 260 }}>
            {(meta ? meta.parameters : []).map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.unit}){p.saved ? '' : ' — tidak disimpan'}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
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
          {paramTerpilih ? (
            <span style={{ fontSize: 12, color: '#7f8c8d' }}>
              {LABEL_KIND[paramTerpilih.kind] || paramTerpilih.kind}
              {' · '}
              {paramTerpilih.agg === 'counter' ? 'akumulasi per periode' : 'rata-rata per periode'}
            </span>
          ) : null}
        </div>

        {!series ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#95a5a6' }}>memuat…</div>
        ) : chartData.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#95a5a6' }}>
            {paramTerpilih && !paramTerpilih.saved
              ? 'Parameter ini tidak disimpan ke database, jadi tidak punya riwayat.'
              : 'Belum ada data pada rentang ini.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {/* counter ditampilkan sebagai batang per periode, gauge sebagai garis */}
            {series.agg === 'counter' ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: '#7f8c8d' }} interval="preserveStartEnd" />
                <YAxis unit={` ${series.unit}`} fontSize={11} tick={{ fill: '#7f8c8d' }} />
                <Tooltip formatter={(v) => [`${formatNilai(v, series.precision)} ${series.unit}`, 'Nilai']} />
                <Bar dataKey="nilai" fill="#1B4F72" />
              </BarChart>
            ) : (
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: '#7f8c8d' }} interval="preserveStartEnd" />
                <YAxis unit={` ${series.unit}`} fontSize={11} tick={{ fill: '#7f8c8d' }} domain={['auto', 'auto']} />
                <Tooltip formatter={(v) => [`${formatNilai(v, series.precision)} ${series.unit}`, 'Nilai']} />
                <Area type="monotone" dataKey="nilai" stroke="#e74c3c" fill="rgba(231,76,60,0.2)" strokeWidth={2} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Seluruh parameter lain, nilai realtime */}
      {lainnya.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
            Parameter lain
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr><th>Parameter</th><th>Besaran</th><th style={{ textAlign: 'right' }}>Nilai</th><th>Satuan</th></tr>
              </thead>
              <tbody>
                {lainnya.map((p) => {
                  const v = live[p.name];
                  const diluar = v !== undefined && v !== null &&
                    ((p.min !== null && Number(v) < p.min) || (p.max !== null && Number(v) > p.max));
                  return (
                    <tr key={p.name} style={{ cursor: 'pointer' }} onClick={() => setTerpilih(p.name)}>
                      <td>{p.name}</td>
                      <td style={{ color: '#7f8c8d' }}>{LABEL_KIND[p.kind] || p.kind}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: diluar ? '#c0392b' : undefined }}>
                        {formatNilai(v, p.precision)}
                      </td>
                      <td style={{ color: '#7f8c8d' }}>{p.unit === '-' ? '' : p.unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DeviceDetail;
