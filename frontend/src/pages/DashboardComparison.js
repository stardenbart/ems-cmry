import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import DeviceSelector from '../components/Common/DeviceSelector';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { exportToExcel } from '../utils/exportExcel';

function DashboardComparison() {
  const [deviceId, setDeviceId] = useState('');
  const [range, setRange] = useState('todayVsYesterday');
  const [data, setData] = useState([]);

  const fetchData = async () => {
    if (!deviceId) return;
    try {
      const res = await api.get('/dashboards/comparison', { params: { device_id: deviceId, range } });
      const { current, previous } = res.data;
      const maxLen = Math.max(current.length, previous.length);
      const merged = [];
      for (let i = 0; i < maxLen; i++) {
        merged.push({
          period: current[i]
            ? new Date(current[i].period).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : `#${i + 1}`,
          current: current[i] ? parseFloat(current[i].total) || 0 : 0,
          previous: previous[i] ? parseFloat(previous[i].total) || 0 : 0,
        });
      }
      setData(merged);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { if (deviceId) fetchData(); }, [deviceId, range]);

  const labels = {
    todayVsYesterday: ['Today', 'Yesterday'],
    thisWeekVsLastWeek: ['This Week', 'Last Week'],
    thisMonthVsLastMonth: ['This Month', 'Last Month'],
    thisYearVsLastYear: ['This Year', 'Last Year'],
  }[range] || ['Current', 'Previous'];

  return (
    <div>
      <h2 className="page-title">Energy Comparison</h2>
      <div className="card">
        <div className="toolbar">
          <DeviceSelector value={deviceId} onChange={setDeviceId} label="Pilih Perangkat" />
          <div className="form-group">
            <label>Time Range</label>
            <select className="selector-select" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="todayVsYesterday">Today vs Yesterday</option>
              <option value="thisWeekVsLastWeek">This Week vs Last Week</option>
              <option value="thisMonthVsLastMonth">This Month vs Last Month</option>
              <option value="thisYearVsLastYear">This Year vs Last Year</option>
            </select>
          </div>
          <button className="btn btn-success" onClick={() => exportToExcel(data, `comparison_${range}`)}>Download</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, color: 'var(--cimory-blue)', marginBottom: 12 }}>Energy Comparison</h3>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="period" fontSize={11} tick={{ fill: '#6B7280' }} />
            <YAxis unit=" kWh" fontSize={11} tick={{ fill: '#6B7280' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="current" fill="var(--cimory-blue)" name={labels[0]} radius={[3,3,0,0]} />
            <Bar dataKey="previous" fill="#F87171" name={labels[1]} radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default DashboardComparison;