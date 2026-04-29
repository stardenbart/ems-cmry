import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import DeviceSelector from '../components/Common/DeviceSelector';
import api from '../api/axios';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { MdElectricMeter, MdSpeed } from 'react-icons/md';
import { BsLightningChargeFill } from 'react-icons/bs';

function BigMetricCard({ title, value, unit, icon: Icon, iconBg = '#1B2A4A' }) {
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
      <div className="rt-card-icon" style={{ background: iconBg }}>
        {Icon && <Icon size={24} color="#fff" />}
      </div>
    </div>
  );
}

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

function RealtimeDevice() {
  const [selectedDevice, setSelectedDevice]   = useState(null);
  const { data: wsData, isConnected }         = useWebSocket();
  const [powerTrend, setPowerTrend]           = useState([]);
  const [monthlyData, setMonthlyData]         = useState([]);
  const [conversion, setConversion]           = useState(null);

  // Energy Today: base = nilai Energy Active pertama hari ini dari DB
  // energyToday = nilaiRealtime - base
  // Ganti state ini:
  const [energyBase, setEnergyBase] = useState(null);
  const [energySource, setEnergySource] = useState(null);

  // Tambah state baru untuk nilai "sudah dari DB":
  const [energyFromDb, setEnergyFromDb] = useState(null); // total kWh hari ini dari DB

  // Untuk demo mode: akumulasi estimasi dari Active Power Total
  // (karena demo random, kita simpan "energy sejak halaman dibuka")
  const demoPowerAccRef = useRef(0);
  const demoLastTimeRef = useRef(null);

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

  // ── Load energy base (nilai Energy Active pertama hari ini dari DB) ───────
  // Update useEffect energy-today:
  useEffect(() => {
    if (!selectedDevice) return;
    setEnergyFromDb(null);
    setEnergySource(null);
    demoPowerAccRef.current = 0;
    demoLastTimeRef.current = null;

    api.get('/dashboards/energy-today', { params: { device_id: selectedDevice } })
      .then((res) => {
        setEnergySource(res.data.source);

        if (res.data.source === 'energy_active') {
          // Simpan base untuk dikurangi dari nilai realtime
          setEnergyBase(parseFloat(res.data.base));
        } else if (res.data.source === 'active_power_estimated') {
          // Langsung simpan total kWh hari ini dari DB sebagai starting point
          setEnergyFromDb(parseFloat(res.data.base));
        }
        // source === 'none' → belum ada data sama sekali, pakai accumulator
      })
      .catch(() => {});
  }, [selectedDevice]);

  // ── Load monthly energy chart data ────────────────────────────────────────
  useEffect(() => {
    if (!selectedDevice) return;
    api.get('/dashboards/energy', { params: { device_id: selectedDevice, range: 'thisMonth' } })
      .then((res) => {
        // Hilangkan .filter(d => d.kWh > 0) supaya hari dengan nilai kecil tetap tampil
        const formatted = res.data.map((d) => ({
          day: new Date(d.period).getDate(),
          kWh: Math.max(0, parseFloat(d.total) || 0),
        }));
        setMonthlyData(formatted);
      })
      .catch(() => {});
  }, [selectedDevice]);

  // ── Ambil data device dari WebSocket ─────────────────────────────────────
  const deviceData = selectedDevice ? (wsData[selectedDevice] || {}) : {};

  // ── Power trend dari WebSocket ────────────────────────────────────────────
  useEffect(() => {
    const power = deviceData['Active Power Total'];
    if (power === undefined || power === null) return;

    const kW = parseFloat(power) || 0;

    // Akumulasi untuk demo mode (estimasi kWh sejak halaman dibuka)
    const now = Date.now();
    if (demoLastTimeRef.current !== null) {
      const dtJam = (now - demoLastTimeRef.current) / 3_600_000; // ms → jam
      demoPowerAccRef.current += kW * dtJam;
    }
    demoLastTimeRef.current = now;

    setPowerTrend((prev) => {
      const next = [...prev, {
        time: new Date().toLocaleTimeString('id-ID'),
        kW,
      }];
      return next.slice(-60);
    });
  }, [deviceData['Active Power Total']]);

  // ── Hitung energyToday ────────────────────────────────────────────────────
  // Update kalkulasi energyToday:
  let energyToday = null;
  const energyNow = parseFloat(deviceData['Energy Active']);

  if (energySource === 'energy_active' && energyBase !== null && !isNaN(energyNow)) {
    // Data real dari meter
    energyToday = Math.max(0, energyNow - energyBase);

  } else if (energySource === 'active_power_estimated') {
    // DB sudah ada data Active Power → pakai nilai dari DB + accumulator sejak refresh
    const fromDb = energyFromDb ?? 0;
    const sinceRefresh = demoPowerAccRef.current;
    energyToday = parseFloat((fromDb + sinceRefresh).toFixed(3));

  } else {
    // source === 'none': belum ada data di DB sama sekali
    const acc = demoPowerAccRef.current;
    energyToday = acc > 0 ? parseFloat(acc.toFixed(3)) : null;
  }

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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h2 className="page-title" style={{ margin: 0 }}>Data Device</h2>
        <span style={{ fontSize: 12 }} className={isConnected ? 'status-connected' : 'status-disconnected'}>
          {isConnected ? '● Connected' : '● Disconnected'}
        </span>
      </div>

      {/* Device selector */}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 16 }}>
        <DeviceSelector value={selectedDevice} onChange={setSelectedDevice} label="Select Device" />
      </div>

      {/* Row 1: Active Power, Voltage, Current, Frequency */}
      <div className="rt-grid-4">
        <BigMetricCard title="Active Power"    value={deviceData['Active Power Total']} unit="kW"  icon={BsLightningChargeFill} iconBg="#1B2A4A" />
        <BigMetricCard title="Voltage L-L"     value={deviceData['Voltage LL Avg']}     unit="V"   icon={BsLightningChargeFill} iconBg="#1B2A4A" />
        <BigMetricCard title="Current"         value={deviceData['Current Avg']}        unit="A"   icon={MdSpeed}              iconBg="#1B2A4A" />
        <BigMetricCard title="Frequency"       value={deviceData['Frequency']}          unit="Hz"  icon={MdElectricMeter}      iconBg="#1B2A4A" />
      </div>

      {/* Row 2: Energy Today, Energy This Month, Power Factor */}
      <div className="rt-grid-3">
        <EnergyCard title="Energy Today"      value={energyToday}  unit="kWh" />
        <EnergyCard title="Energy This Month" value={energyMonth}  unit="kWh" />
        <BigMetricCard title="Power Factor Total" value={deviceData['Power Factor Total']} unit="" icon={MdElectricMeter} iconBg="#1B2A4A" />
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

      {/* Power Trend Chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Overview</div>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#1B4F72' }}>Power Trend (kW)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={powerTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" fontSize={11} tick={{ fill: '#7f8c8d' }} interval="preserveStartEnd" />
            <YAxis unit=" kW" fontSize={11} tick={{ fill: '#7f8c8d' }} />
            <Tooltip />
            <Area type="monotone" dataKey="kW" stroke="#e74c3c" fill="rgba(231,76,60,0.25)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Energy Bar Chart */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Overview</div>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#1B4F72' }}>Energy Usage This Month</h3>
        {monthlyData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#95a5a6', fontSize: 13 }}>
            Data belum tersedia — menunggu dataLogger menyimpan readings pertama
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
    </div>
  );
}

export default RealtimeDevice;