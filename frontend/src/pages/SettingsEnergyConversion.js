import React, { useState, useEffect } from 'react';
import api from '../api/axios';

function SettingsEnergyConversion() {
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ co2_per_kwh: '', fuel_per_kwh: '', cost_per_kwh: '' });

  const fetchData = async () => {
    const res = await api.get('/settings/energy-conversions');
    setHistory(res.data);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/settings/energy-conversions', {
        co2_per_kwh: parseFloat(form.co2_per_kwh) || 0,
        fuel_per_kwh: parseFloat(form.fuel_per_kwh) || 0,
        cost_per_kwh: parseFloat(form.cost_per_kwh) || 0,
      });
      setForm({ co2_per_kwh: '', fuel_per_kwh: '', cost_per_kwh: '' });
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  return (
    <div>
      <h2 className="page-title">Energy Conversion</h2>
      <div className="card">
        <form onSubmit={handleSubmit} style={{ maxWidth: 500 }}>
          <div className="form-group">
            <label>CO2 Value (1 kWh = ... kg CO2)</label>
            <input type="number" step="0.01" value={form.co2_per_kwh} onChange={(e) => setForm({ ...form, co2_per_kwh: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Fuel Value (1 kWh = ... liter)</label>
            <input type="number" step="0.01" value={form.fuel_per_kwh} onChange={(e) => setForm({ ...form, fuel_per_kwh: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>IDR Value (1 kWh = ... IDR)</label>
            <input type="number" step="1" value={form.cost_per_kwh} onChange={(e) => setForm({ ...form, cost_per_kwh: e.target.value })} required />
          </div>
          <button type="submit" className="btn btn-primary">Add Energy Data</button>
        </form>
        <div className="table-responsive" style={{ marginTop: 20 }}>
          <table className="data-table" style={{ marginTop: 20 }}>
            <thead>
              <tr><th>Date</th><th>CO2 (kg/kWh)</th><th>Fuel (L/kWh)</th><th>Cost IDR (IDR/kWh)</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString('id-ID')}</td>
                  <td>{h.co2_per_kwh}</td>
                  <td>{h.fuel_per_kwh}</td>
                  <td>{h.cost_per_kwh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SettingsEnergyConversion;