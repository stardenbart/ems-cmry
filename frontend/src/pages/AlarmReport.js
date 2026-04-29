import React, { useState } from 'react';
import api from '../api/axios';
import { exportToExcel } from '../utils/exportExcel';
import { formatDateTime } from '../utils/formatters';

function AlarmReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);

  const generate = async () => {
    if (!startDate || !endDate) return alert('Pilih tanggal mulai dan akhir');
    try {
      const res = await api.get('/reports/alarm', { params: { start: startDate, end: endDate } });
      setData(res.data);
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      <h2 className="page-title">Alarm Report</h2>
      <div className="card">
        <div className="toolbar">
          <div className="form-group">
            <label>Start Date</label>
            <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={generate}>Generate Report</button>
          <button className="btn btn-success" onClick={() => exportToExcel(data, 'alarm_report')}>Download Report</button>
        </div>

        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Alarm Name</th><th>Message</th><th>Acknowledge At</th><th>Acknowledge By</th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.triggered_at)}</td>
                <td>{r.alarm_name}</td>
                <td>{r.message}</td>
                <td>{r.acknowledged_at ? formatDateTime(r.acknowledged_at) : '-'}</td>
                <td>{r.acknowledged_by || '-'}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: '#999' }}>Belum ada data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AlarmReport;