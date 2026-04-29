import React from 'react';
import './MetricCard.css';

function MetricCard({ title, value, unit, color }) {
  return (
    <div className="metric-card" style={{ borderTopColor: color || '#2471A3' }}>
      <div className="metric-title">{title}</div>
      <div className="metric-value">
        {value !== null && value !== undefined ? parseFloat(value).toFixed(2) : '0'}
        <span className="metric-unit">{unit || ''}</span>
      </div>
    </div>
  );
}

export default MetricCard;