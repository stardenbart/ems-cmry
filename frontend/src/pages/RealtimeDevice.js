import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import DeviceSelector from '../components/Common/DeviceSelector';
import MetricPanel, { formatNilai, tampilSatuan } from '../components/Common/MetricPanel';
import KpiCardEditor from '../components/Common/KpiCardEditor';
import api from '../api/axios';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { BsLightningChargeFill } from 'react-icons/bs';

function EnergyCard({ title, value, unit }) {
  const display =
    value !== null && value !== undefined && !isNaN(value)
      ? parseFloat(value).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—';
  return (
    <div className="rt-card">
      <div className="rt-card-info">
        <div className="rt-card-label">{title}</div>
        <div className="rt-card-value">
          {display}
          {display !== '—' && <span className="rt-card-unit">{unit}</span>}
        </div>
      </div>
      <div className="rt-card-icon" style={{ background: 'var(--cimory-blue-dark)', flexDirection: 'column', gap: 1 }}>
        <BsLightningChargeFill size={16} color="#fff" />
        <span style={{ fontSize: 7, color: '#fff', fontWeight: 700 }}>{unit}</span>
        <span style={{ fontSize: 6, color: 'rgba(255,255,255,0.6)' }}>{title === 'Energy Today' ? 'TODAY' : 'MONTHLY'}</span>
      </div>
    </div>
  );
}

const WARNA_TREN = ['#e74c3c', '#1B4F72', '#27ae60', '#e67e22'];
const MAKS_GRAFIK = 4;
const TITIK_GRAFIK = 60; // 60 titik x 3 detik = 3 menit, sama seperti grafik daya sebelumnya

// Grafik yang ditampilkan. Kalau user sudah pernah memilih (ada parameter
// dengan `chart` bernilai true/false), pilihannya yang dipakai. Kalau belum,
// default: gauge featured pertama beserta yang satuannya sama — untuk PM2200
// itu daya aktif saja seperti dulu, untuk perekam suhu empat kanal pertama.
export function pilihGrafik(params) {
  const list = params || [];
  if (list.some((p) => p.chart === true || p.chart === false)) {
    return list.filter((p) => p.chart === true).slice(0, MAKS_GRAFIK);
  }
  const g = list.filter((p) => p.featured && p.agg !== 'counter');
  return g.length ? g.filter((p) => p.unit === g[0].unit).slice(0, MAKS_GRAFIK) : [];
}

// Satu grafik per parameter. Gaya dan animasinya mengikuti grafik daya lama
// (area monotone dengan animasi bawaan recharts) yang terasa mengalir.
function LiveChart({ param, data, color, wide }) {
  const judul = param.label || param.name;
  const satuan = tampilSatuan(param.unit);
  const gid = `grad-${param.name.replace(/[^a-zA-Z0-9]/g, '')}`;
  const terakhir = data.length ? data[data.length - 1][param.name] : null;
  return (
    <div className="card" style={{ marginBottom: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        Live · last 3 minutes
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 12px' }}>
        <h3 style={{ margin: 0, fontSize: 17, color: '#1B4F72' }}>
          {judul}{satuan ? ` (${satuan})` : ''}
        </h3>
        <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color }}>
          {formatNilai(terakhir, param.precision)}{satuan ? ` ${satuan}` : ''}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" fontSize={11} tick={{ fill: '#7f8c8d' }} interval="preserveStartEnd" minTickGap={40} />
          <YAxis fontSize={11} tick={{ fill: '#7f8c8d' }} domain={['auto', 'auto']} width={56}
            tickFormatter={(v) => formatNilai(v, param.precision)} />
          <Tooltip formatter={(v) => [`${formatNilai(v, param.precision)}${satuan ? ` ${satuan}` : ''}`, judul]} />
          <Area type="monotone" dataKey={param.name} stroke={color} fill={`url(#${gid})`}
            strokeWidth={2} dot={false} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RealtimeDevice() {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const { data: wsData, isConnected }       = useWebSocket();
  const [trend, setTrend]                   = useState([]);
  const [monthlyData, setMonthlyData]       = useState([]);
  const [conversion, setConversion]         = useState(null);

  // Energy Today state
  const [energyBase, setEnergyBase]     = useState(null); // nilai Wh pertama hari ini (dalam kWh, sudah /1000)
  const [energySource, setEnergySource] = useState(null); // 'energy_active' | 'active_power_estimated' | 'none'
  const [energyFromDb, setEnergyFromDb] = useState(null); // untuk fallback estimasi Active Power

  const intervalRef = useRef(null);

  // Kartu KPI kini mengikuti metadata parameter, bukan nama yang ditulis di kode.
  const [paramMeta, setParamMeta] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  // ── Load device list & auto-select first ──────────────────────────────────
  useEffect(() => {
    api.get('/devices')
      .then((res) => {
        if (res.data.length > 0) setSelectedDevice(res.data[0].id);
      })
      .catch(() => {});
  }, []);

  // ── Load energy conversion factors ────────────────────────────────────────
  useEffect(() => {
    api.get('/dashboards/energy-conversion')
      .then((res) => setConversion(res.data))
      .catch(() => {});
  }, []);

  // ── Load energy base dari DB ───────────────────────────────────────────────
  const muatMeta = React.useCallback(() => {
    if (!selectedDevice) return;
    api.get('/devices/' + selectedDevice + '/parameters')
      .then((res) => setParamMeta(res.data))
      .catch(() => setParamMeta(null));
  }, [selectedDevice]);

  useEffect(() => { muatMeta(); }, [muatMeta]);

  useEffect(() => {
    if (!selectedDevice) return;
    setEnergyBase(null);
    setEnergyFromDb(null);
    setEnergySource(null);

    api.get('/dashboards/energy-today', { params: { device_id: selectedDevice } })
      .then((res) => {
        setEnergySource(res.data.source);
        if (res.data.source === 'energy_active') {
          // base sudah dalam kWh (backend sudah /1000)
          setEnergyBase(parseFloat(res.data.base));
        } else if (res.data.source === 'active_power_estimated') {
          setEnergyFromDb(parseFloat(res.data.base));
        }
      })
      .catch(() => {});
  }, [selectedDevice]);

  // ── Load monthly energy chart data ────────────────────────────────────────
  useEffect(() => {
    if (!selectedDevice) return;

    const fetchMonthly = () => {
      api.get('/dashboards/energy', { params: { device_id: selectedDevice, range: 'thisMonth' } })
        .then((res) => {
          const formatted = res.data.map((d) => ({
            day: new Date(d.period).getDate(),
            kWh: Math.max(0, parseFloat(d.total) || 0),
          }));
          setMonthlyData(formatted);
        })
        .catch(() => {});
    }; 
  
    fetchMonthly();
    const now = new Date();
    const msUntilNext15 = (15 - (now.getMinutes() % 15)) * 60000 - now.getSeconds() * 1000 - now.getMilliseconds();

    const timeout = setTimeout(() => {
      fetchMonthly();
      const interval = setInterval(fetchMonthly, 900000);
      intervalRef.current = interval
    }, msUntilNext15);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedDevice]);

  // ── Ambil data device dari WebSocket ──────────────────────────────────────
  const deviceData = selectedDevice ? (wsData[selectedDevice] || {}) : {};

  // ── Grafik live, dipilih dari metadata ───────────────────────────────────
  const params = useMemo(() => (paramMeta ? paramMeta.parameters : []), [paramMeta]);
  const punyaEnergi = params.some((p) => p.kind === 'energy');
  const chartParams = useMemo(() => pilihGrafik(params), [params]);

  // Statistik kanal hanya untuk device non-energi: seluruh gauge featured,
  // terlepas dari mana yang dipilih sebagai grafik.
  const statParams = useMemo(
    () => (punyaEnergi ? [] : params.filter((p) => p.featured && p.agg !== 'counter')),
    [params, punyaEnergi]);

  // Satu buffer untuk grafik dan statistik, berkunci `name` (bukan label,
  // supaya mengganti judul kartu tidak memutus kurva yang sedang berjalan).
  const dilacak = useMemo(() => {
    const m = {};
    [...chartParams, ...statParams].forEach((x) => { m[x.name] = x; });
    return Object.values(m);
  }, [chartParams, statParams]);

  useEffect(() => { setTrend([]); }, [selectedDevice]);

  // Setiap pesan realtime mengganti objek device, jadi referensinya cukup
  // sebagai pemicu satu titik baru.
  const snapshot = selectedDevice ? wsData[selectedDevice] : null;
  useEffect(() => {
    if (!snapshot || dilacak.length === 0) return;
    const titik = { time: new Date().toLocaleTimeString('en-GB') };
    dilacak.forEach((x) => {
      const v = Number(snapshot[x.name]);
      titik[x.name] = Number.isFinite(v) ? v : null;
    });
    // 120 titik x 3 detik = 6 menit untuk statistik; grafik memakai 60 terakhir.
    setTrend((prev) => [...prev, titik].slice(-120));
  }, [snapshot, dilacak]);

  const trendGrafik = useMemo(() => trend.slice(-TITIK_GRAFIK), [trend]);

  // Statistik per kanal selama jendela live: yang biasanya dicari pada
  // pemantauan suhu — nilai di luar batas, laju naik/turun (ramp), dan
  // selisih antar titik ukur yang seharusnya bergerak bersama.
  const statistik = useMemo(() => statParams.map((x) => {
    const nilai = trend.map((r) => r[x.name]).filter((v) => v !== null && v !== undefined);
    if (nilai.length === 0) return { p: x, n: 0 };
    const min = Math.min(...nilai);
    const max = Math.max(...nilai);
    const avg = nilai.reduce((s, v) => s + v, 0) / nilai.length;
    // Laju per menit dari kira-kira satu menit terakhir (20 sampel x 3 detik).
    const ekor = nilai.slice(-20);
    const menit = ((ekor.length - 1) * 3) / 60;
    const laju = menit > 0 ? (ekor[ekor.length - 1] - ekor[0]) / menit : null;
    return { p: x, n: nilai.length, now: nilai[nilai.length - 1], min, max, avg, laju };
  }), [trend, statParams]);

  const kiniSemua = statistik.filter((s) => s.n > 0).map((s) => s.now);
  const statUnit = statParams.length ? tampilSatuan(statParams[0].unit) : '';
  const satuSatuan = statParams.every((x) => x.unit === (statParams[0] || {}).unit);
  const sebaran = satuSatuan && kiniSemua.length > 1 ? Math.max(...kiniSemua) - Math.min(...kiniSemua) : null;

  // ── Hitung energyToday ────────────────────────────────────────────────────
  let energyToday = null;

  if (energySource === 'energy_active' && energyBase !== null) {
    // Nilai realtime dari WebSocket dalam Wh → konversi ke kWh → kurangi base
    const energyNowWh = parseFloat(deviceData['Active Energy Delivered (Into Load)']);
    if (!isNaN(energyNowWh) && energyNowWh > 0) {
      const energyNowKwh = energyNowWh / 1000;
      energyToday = Math.max(0, parseFloat((energyNowKwh - energyBase).toFixed(2)));
    }
  } else if (energySource === 'active_power_estimated' && energyFromDb !== null) {
    // Pakai nilai estimasi dari DB — stabil saat refresh, update tiap 15 menit
    energyToday = energyFromDb;
  }
  // source === 'none' → energyToday tetap null → tampil '—'

  // ── Hitung energyMonth dari data chart ────────────────────────────────────
  const energyMonth = monthlyData.length > 0
    ? parseFloat(monthlyData.reduce((sum, d) => sum + d.kWh, 0).toFixed(2))
    : null;

  // ── Energy conversion ─────────────────────────────────────────────────────
  const co2Today  = conversion && energyToday  ? energyToday  * conversion.co2_per_kwh  : null;
  const fuelToday = conversion && energyToday  ? energyToday  * conversion.fuel_per_kwh : null;
  const idrToday  = conversion && energyToday  ? energyToday  * conversion.cost_per_kwh : null;
  const co2Month  = conversion && energyMonth  ? energyMonth  * conversion.co2_per_kwh  : null;
  const fuelMonth = conversion && energyMonth  ? energyMonth  * conversion.fuel_per_kwh : null;
  const idrMonth  = conversion && energyMonth  ? energyMonth  * conversion.cost_per_kwh : null;

  const fmt = (v, d = 2) =>
    v !== null && v !== undefined && !isNaN(v)
      ? parseFloat(v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d })
      : '—';

  // ── Power Factor A: register 3077 dibaca float32be, sudah dalam satuan akhir.

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h2 className="page-title" style={{ margin: 0 }}>Realtime Diagram</h2>
        <span style={{ fontSize: 12 }} className={isConnected ? 'status-connected' : 'status-disconnected'}>
          {isConnected ? '● Connected' : '● Disconnected'}
        </span>
      </div>

      {/* Device selector */}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <DeviceSelector value={selectedDevice} onChange={setSelectedDevice} label="Select Device" />
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowEditor(!showEditor)}>
            {showEditor ? 'Close settings' : 'Configure cards & charts'}
          </button>
        </div>
        {paramMeta ? (
          <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 8 }}>
            {paramMeta.typeName} · address {paramMeta.address} · {paramMeta.parameters.length} parameters
          </div>
        ) : null}
      </div>

      {showEditor && paramMeta ? (
        <KpiCardEditor
          typeName={paramMeta.typeName}
          parameters={paramMeta.parameters}
          live={deviceData}
          charts={chartParams.map((x) => x.name)}
          onClose={() => setShowEditor(false)}
          onSaved={() => { muatMeta(); setShowEditor(false); }}
        />
      ) : null}

      {/* KPI cards, chosen from the featured flag in Data Mapping */}
      <div className="rt-grid-4">
        {(paramMeta ? paramMeta.parameters.filter((p) => p.featured) : []).map((p) => (
          <MetricPanel key={p.name} meta={{ ...p, label: p.label || p.name }} value={deviceData[p.name]} />
        ))}
      </div>

      {punyaEnergi ? (<>
      {/* Energy totals, computed rather than read directly from a register */}
      <div className="rt-grid-3">
        <EnergyCard title="Energy Today"      value={energyToday}  unit="kWh" />
        <EnergyCard title="Energy This Month" value={energyMonth}  unit="kWh" />
      </div>

      {/* Energy Conversion Table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
          Energy Conversion
        </div>
        <div className="table-responsive" style={{ marginTop: 20 }}>
          <table className="data-table">
            <thead>
              <tr><th>Type</th><th>Today</th><th>This Month</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>to CO2</td>
                <td>{fmt(co2Today)}</td>
                <td>{fmt(co2Month)}</td>
              </tr>
              <tr>
                <td>to Fuel</td>
                <td>{fmt(fuelToday)}</td>
                <td>{fmt(fuelMonth)}</td>
              </tr>
              <tr>
                <td>to IDR</td>
                <td>{fmt(idrToday, 0)}</td>
                <td>{fmt(idrMonth, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      </>) : null}

      {/* Live charts: one per chosen parameter, at most 4 in a 2 x 2 grid */}
      {chartParams.length > 0 ? (
        <div className="rt-chart-grid">
          {chartParams.map((x, i) => (
            <LiveChart key={x.name} param={x} data={trendGrafik} color={WARNA_TREN[i % WARNA_TREN.length]}
              wide={chartParams.length === 1 || (chartParams.length === 3 && i === 2)} />
          ))}
        </div>
      ) : null}

      {/* Per-channel statistics for non-energy devices (temperature, pressure, ...) */}
      {!punyaEnergi && statistik.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Channel statistics · live window
            {sebaran !== null ? (
              <span style={{ marginLeft: 12, textTransform: 'none', color: '#1B4F72' }}>
                Spread between channels now: <strong>{formatNilai(sebaran, 1)} {statUnit}</strong>
              </span>
            ) : null}
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th style={{ textAlign: 'right' }}>Now</th>
                  <th style={{ textAlign: 'right' }}>Min</th>
                  <th style={{ textAlign: 'right' }}>Max</th>
                  <th style={{ textAlign: 'right' }}>Average</th>
                  <th style={{ textAlign: 'right' }}>Rate of change</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {statistik.map((s) => {
                  const u = tampilSatuan(s.p.unit);
                  const luar = s.n > 0 && (
                    (s.p.min !== null && s.now < s.p.min) || (s.p.max !== null && s.now > s.p.max));
                  return (
                    <tr key={s.p.name}>
                      <td style={{ fontWeight: 600 }}>{s.p.label || s.p.name}</td>
                      <td style={{ textAlign: 'right' }}>{s.n ? `${formatNilai(s.now, s.p.precision)} ${u}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{s.n ? formatNilai(s.min, s.p.precision) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{s.n ? formatNilai(s.max, s.p.precision) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{s.n ? formatNilai(s.avg, s.p.precision) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {s.laju === null || s.laju === undefined
                          ? '—'
                          : `${s.laju > 0 ? '+' : ''}${formatNilai(s.laju, 2)} ${u}/min`}
                      </td>
                      <td style={{ color: luar ? '#c0392b' : '#27ae60' }}>
                        {s.n === 0 ? 'no data' : luar ? 'out of range' : 'normal'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 8 }}>
            Status compares against the Min/Max set in Data Mapping. Use Alarm Rules to be notified when a
            channel leaves its process range for longer than a hold time.
          </div>
        </div>
      ) : null}

      {/* Monthly Energy Bar Chart */}
      {punyaEnergi ? (
      <div className="card">
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Overview</div>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#1B4F72' }}>Energy Usage This Month</h3>
        {monthlyData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#95a5a6', fontSize: 13 }}>
            No data yet — waiting for the data logger to store the first readings
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" fontSize={11} tick={{ fill: '#7f8c8d' }} />
              <YAxis unit=" kWh" fontSize={11} tick={{ fill: '#7f8c8d' }} />
              <Tooltip formatter={(v) => [`${parseFloat(v).toFixed(2)} kWh`, 'Energy']} />
              <Bar dataKey="kWh" fill="#e74c3c" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      ) : null}
    </div>
  );
}

export default RealtimeDevice;