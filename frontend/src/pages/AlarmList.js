import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useWebSocket } from '../hooks/useWebSocket';
import { formatDateTime } from '../utils/formatters';

function AlarmList() {
  const [logs, setLogs] = useState([]);
  const { alarms: realtimeAlarms } = useWebSocket();

  const fetchLogs = async () => {
    try {
      const res = await api.get('/alarms/logs');
      setLogs(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchLogs(); }, []);

  // Tambahkan alarm real-time ke daftar
  useEffect(() => {
    if (realtimeAlarms.length > 0) fetchLogs();
  }, [realtimeAlarms]);

  const handleAcknowledge = async (id) => {
    try {
      await api.put(`/alarms/logs/${id}/acknowledge`);
      fetchLogs();
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal acknowledge');
    }
  };

  return (
    <div>
      <h2 className="page-title">Alarm List</h2>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Section</th>
              <th>Message</th>
              <th>Acknowledge</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.triggered_at).toLocaleDateString('id-ID')}</td>
                <td>{new Date(log.triggered_at).toLocaleTimeString('id-ID')}</td>
                <td>{log.device_name || log.alarm_name}</td>
                <td>{log.message}</td>
                <td>
                  {log.acknowledged_at ? (
                    <span style={{ color: '#7f8c8d', fontSize: 12 }}>
                      {formatDateTime(log.acknowledged_at)} by {log.acknowledged_by}
                    </span>
                  ) : (
                    <button className="btn btn-warning" onClick={() => handleAcknowledge(log.id)}>
                      Acknowledge
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: '#999' }}>Tidak ada alarm</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AlarmList;