import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

// Sedang berjalan sebagai aplikasi terpasang (Edge/Chrome "Install as app")?
// Jendela aplikasi melaporkan display-mode standalone; ?desktop=1 dari
// start_url manifest dipakai sebagai cadangan. Tombol install disembunyikan
// di dalam aplikasi itu sendiri.
export function isDesktopApp() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
    return new URLSearchParams(window.location.search).get('desktop') === '1';
  } catch (e) { return false; }
}

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
      label: 'Overview', key: 'overview', path: '/overview',
      levels: ['admin','maintenance','operator','viewer'],
    },
    {
      label: 'Device Monitor', key: 'device-monitor', path: '/device',
      levels: ['admin','maintenance','operator','viewer'],
    },
    {
      label: 'Measurement Trends', key: 'kind-dash', path: '/dashboard/trends',
      levels: ['admin','maintenance','operator','viewer'],
    },
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
      // Dikelompokkan per tujuan, dan kelompok pertama diurutkan sesuai urutan
      // setup device baru: jalur dulu, lalu peta register, baru device-nya,
      // terakhir letaknya di pohon aset. Device tidak bisa dibuat sebelum
      // gateway dan tipe device-nya ada.
      label: 'Settings', key: 'settings',
      levels: ['admin','maintenance'],
      children: [
        { label: 'Devices & Connection', subKey: 'set-devices',
          children: [
            ...(level === 'admin' ? [
              { label: '1. Data Gateway', path: '/settings/gateway' },
              { label: '2. Data Mapping', path: '/settings/data-mapping' },
              { label: '3. Device', path: '/settings/device' },
            ] : []),
            { label: '4. Asset Hierarchy', path: '/settings/assets' },
            { label: 'Grouping (legacy)', path: '/settings/grouping' },
          ],
        },
        { label: 'Units & Conversion', subKey: 'set-units',
          children: [
            { label: 'Units', path: '/settings/units' },
            { label: 'Energy Conversion', path: '/settings/energy-conversion' },
          ],
        },
        { label: 'Alarms & Email', subKey: 'set-alarms',
          children: [
            { label: 'Alarm Rules', path: '/settings/alarm-rules' },
            { label: 'Alarm (legacy)', path: '/settings/alarm' },
            ...(level === 'admin' ? [{ label: 'SMTP (email server)', path: '/settings/smtp' }] : []),
          ],
        },
        { label: 'Production Calendar', subKey: 'set-calendar',
          children: [
            { label: 'Shifts & Calendar', path: '/settings/shift' },
          ],
        },
        ...(level === 'admin' ? [
          { label: 'Users & Access', subKey: 'set-users',
            children: [
              { label: 'User Management', path: '/settings/users' },
              { label: 'Roles & Permissions', path: '/settings/roles' },
            ],
          },
        ] : []),
      ],
    },
    {
      label: 'User Guide', key: 'guide', path: '/guide',
      levels: ['admin','maintenance','operator','viewer'],
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
          {!isDesktopApp() ? (
            <Link className="sidebar-bottom-btn" to="/guide#desktop-app"
              title="Install EMS as a desktop app with its own icon"
              onClick={() => { if (window.innerWidth <= 768) onClose(); }}>
              Install Desktop App
            </Link>
          ) : null}
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