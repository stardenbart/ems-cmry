import React, { useState, useEffect } from 'react';
import api from '../../api/axios';

function DeviceSelector({ value, onChange, label = 'Pilih Perangkat' }) {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    api.get('/devices')
      .then((res) => setDevices(res.data))
      .catch((err) => console.error('Error loading devices:', err));
  }, []);

  return (
    <div className="selector-container">
      <label className="selector-label">{label}</label>
      <select
        className="selector-select"
        value={value || ''}
        onChange={(e) => onChange(parseInt(e.target.value))}
      >
        <option value="">-- Pilih --</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    </div>
  );
}

export default DeviceSelector;