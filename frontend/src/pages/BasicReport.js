import React, { useState } from 'react';
import api from '../api/axios';
import DeviceSelector from '../components/Common/DeviceSelector';
import { exportToExcel } from '../utils/exportExcel';
import { formatDateTime } from '../utils/formatters';

function BasicReport() {
  const [deviceId, setDeviceId] = useState('');
  const [parameter, setParameter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);
  const [params, setParams] = useState([]);

  const loadParams = async (id) => {
    setDeviceId(id);
    try {
      const res = await api.get(`/reports/parameters/${id}`);
      setParams(res.data);
    } catch (err) { setParams([]); }
  };

  const generate = async () => {
    if (!deviceId || !startDate || !endDate) return alert('Lengkapi semua field');
    try {
      const res = await api.get('/reports/basic', {
        params: { device_id: deviceId, parameter: parameter || undefined, start: startDate, end: endDate },
      });
      setData(res.data);
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      <h2 className="page-title">Basic Report</h2>
      <div className="card">
        <div className="toolbar">
          <DeviceSelector value={deviceId} onChange={loadParams} />
          <div className="form-group">
            <label>Parameter</label>
            <select className="selector-select" value={parameter} onChange={(e) => setParameter(e.target.value)}>
              <option value="">All Parameters</option>
              {params.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Start Date</label>
            <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={generate}>Generate Report</button>
          <button className="btn btn-success" onClick={() => exportToExcel(data, 'basic_report')}>Download Report</button>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Device</th><th>Parameter</th><th>Value</th></tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td>{formatDateTime(r.date)}</td>
                <td>{r.device}</td>
                <td>{r.parameter}</td>
                <td>{parseFloat(r.value).toFixed(2)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                Belum ada data. Pilih filter lalu klik Generate Report.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BasicReport;