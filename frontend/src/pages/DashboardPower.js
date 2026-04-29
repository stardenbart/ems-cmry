import React, { useState } from 'react';
import api from '../api/axios';
import DeviceSelector from '../components/Common/DeviceSelector';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToExcel } from '../utils/exportExcel';

function DashboardPower() {
  const [deviceId, setDeviceId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);

  const generate = async () => {
    if (!deviceId || !startDate || !endDate) return alert('Lengkapi semua field');
    try {
      const res = await api.get('/dashboards/power', {
        params: { device_id: deviceId, start: startDate, end: endDate },
      });
      const formatted = res.data.map((d) => ({
        time: new Date(d.period).toLocaleString('id-ID'),
        kW: parseFloat(d.total) || 0,
      }));
      setData(formatted);
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      <h2 className="page-title">Power Dashboard</h2>
      <div className="card">
        <div className="toolbar">
          <DeviceSelector value={deviceId} onChange={setDeviceId} label="Pilih Perangkat" />
          <div className="form-group">
            <label>Start Date</label>
            <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={generate}>Generate</button>
          <button className="btn btn-success" onClick={() => exportToExcel(data, 'power_dashboard')}>Download</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, color: 'var(--cimory-blue)', marginBottom: 12 }}>Power Dashboard (kW)</h3>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="time" fontSize={10} tick={{ fill: '#6B7280' }} />
            <YAxis unit=" kW" fontSize={11} tick={{ fill: '#6B7280' }} />
            <Tooltip />
            <Line type="monotone" dataKey="kW" stroke="#E63946" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default DashboardPower;