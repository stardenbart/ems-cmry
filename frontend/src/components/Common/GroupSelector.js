import React, { useState, useEffect } from 'react';
import api from '../../api/axios';

function GroupSelector({ value, onChange }) {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    api.get('/settings/groups')
      .then((res) => setGroups(res.data))
      .catch((err) => console.error('Error loading groups:', err));
  }, []);

  return (
    <div className="selector-container">
      <label className="selector-label">Select Group</label>
      <select
        className="selector-select"
        value={value || ''}
        onChange={(e) => onChange(parseInt(e.target.value))}
      >
        <option value="">-- Select --</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    </div>
  );
}

export default GroupSelector;