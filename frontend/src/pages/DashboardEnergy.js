import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import DeviceSelector from '../components/Common/DeviceSelector';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { exportToExcel } from '../utils/exportExcel';

function DashboardEnergy() {
  const [deviceId, setDeviceId] = useState('');
  const [range, setRange] = useState('today');
  const [data, setData] = useState([]);

  const fetchData = async () => {
    if (!deviceId) return;
    try {
      const res = await api.get('/dashboards/energy', { params: { device_id: deviceId, range } });
      const formatted = res.data.map((d) => ({
        period: new Date(d.period).toLocaleString('id-ID', {
          ...(range === 'today' ? { hour: '2-digit', minute: '2-digit' } :
             range === 'thisYear' ? { month: 'short' } :
             { day: '2-digit', month: 'short' }),
        }),
        total: parseFloat(d.total) || 0,
      }));
      setData(formatted);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { if (deviceId) fetchData(); }, [deviceId, range]);

  return (
    <div>
      <h2 className="page-title">Energy Dashboard</h2>
      <div className="card">
        <div className="toolbar">
          <DeviceSelector value={deviceId} onChange={setDeviceId} label="Pilih Perangkat" />
          <div className="form-group">
            <label>Time Range</label>
            <select className="selector-select" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="thisWeek">This Week</option>
              <option value="thisMonth">This Month</option>
              <option value="thisYear">This Year</option>
            </select>
          </div>
          <button className="btn btn-success" onClick={() => exportToExcel(data, `energy_${range}`)}>Download</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, color: 'var(--cimory-blue)', marginBottom: 12 }}>Energy Dashboard</h3>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="period" fontSize={11} tick={{ fill: '#6B7280' }} />
            <YAxis unit=" kWh" fontSize={11} tick={{ fill: '#6B7280' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="total" fill="var(--cimory-blue)" name="Energi (kWh)" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default DashboardEnergy;