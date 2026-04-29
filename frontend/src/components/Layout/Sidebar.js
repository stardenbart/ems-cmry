import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [openMenus, setOpenMenus] = useState({});
  const level = user?.level || 'viewer';

  const toggleMenu = (key) => {
    setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  
  React.useEffect(() => {
    if (isOpen && window.innerWidth <= 768) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const isActive = (path) => location.pathname === path;

  const menuItems = [
    {
      label: 'Realtime Diagram', key: 'realtime', path: '/realtime/device',
      levels: ['admin','maintenance','operator','viewer'],
    },
    {
      label: 'Dashboard', key: 'dashboard',
      levels: ['admin','maintenance','operator','viewer'],
      children: [
        { label: 'Device', subKey: 'dash-device',
          children: [
            { label: 'Energy', path: '/dashboard/energy' },
            { label: 'Comparison', path: '/dashboard/comparison' },
            { label: 'Power', path: '/dashboard/power' },
            { label: 'PQ', path: '/dashboard/pq' },
          ]
        },
        { label: 'Group', subKey: 'dash-group',
          children: [
            { label: 'Total Energy', path: '/dashboard/group/energy' },
            { label: 'Usage Comparison', path: '/dashboard/group/comparison' },
            { label: 'KVA Trend', path: '/dashboard/group/kva' },
          ]
        },
      ],
    },
    {
      label: 'Report', key: 'report',
      levels: ['admin','maintenance','operator'],
      children: [
        { label: 'Basic Report', path: '/report/basic' },
        ...(level === 'admin' || level === 'maintenance'
          ? [{ label: 'Alarm Report', path: '/report/alarm' }] : []),
      ],
    },
    { label: 'Alarm', key: 'alarm', path: '/alarm', levels: ['admin','maintenance','operator'] },
    {
      label: 'Settings', key: 'settings',
      levels: ['admin','maintenance'],
      children: [
        ...(level === 'admin' ? [
          { label: 'Device', path: '/settings/device' },
          { label: 'Data Gateway', path: '/settings/gateway' },
          { label: 'Data Mapping', path: '/settings/data-mapping' },
        ] : []),
        { label: 'Grouping', path: '/settings/grouping' },
        { label: 'Energy Conversion', path: '/settings/energy-conversion' },
        { label: 'Alarm', path: '/settings/alarm' },
        ...(level === 'admin' ? [
          { label: 'User Management', path: '/settings/users' },
          { label: 'SMTP', path: '/settings/smtp' },
        ] : []),
      ],
    },
  ];

  const renderItems = (items, depth = 0) => {
    return items
      .filter((item) => !item.levels || item.levels.includes(level))
      .map((item) => {
        if (item.children) {
          const key = item.key || item.subKey;
          return (
            <div key={key}>
              <div className={`sidebar-item depth-${depth}`} onClick={() => toggleMenu(key)}>
                {item.label}
                <span className="arrow">{openMenus[key] ? '▼' : '▶'}</span>
              </div>
              {openMenus[key] && (
                <div className="sidebar-submenu">{renderItems(item.children, depth + 1)}</div>
              )}
            </div>
          );
        }
        return (
          <Link key={item.path} to={item.path}
            className={`sidebar-item depth-${depth} ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => { if (window.innerWidth <= 768) onClose(); }}>
            {item.label}
          </Link>
        );
      });
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <nav className="sidebar-nav">{renderItems(menuItems)}</nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user-info">{user?.name}</div>
          <button className="sidebar-bottom-btn" onClick={() => { navigate('/change-password'); if (window.innerWidth <= 768) onClose(); }}>
            Change Password
          </button>
          <button className="sidebar-bottom-btn sidebar-logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </>
  );
}

export default Sidebar;