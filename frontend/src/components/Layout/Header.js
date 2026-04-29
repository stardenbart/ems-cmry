import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

function Header({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="header-left">
        <button className="sidebar-toggle" onClick={onToggleSidebar}>☰</button>
        <img src="/Logo_Cimory.png" alt="Cimory" className="header-logo" />
        <div className="header-titles">
          <h3 className="header-title">Energy Monitoring System</h3>
          <span className="header-subtitle">PT CISARUA MOUNTAIN DAIRY TBK</span>
        </div>
      </div>
      <div className="header-right">
        <span className="header-user">Welcome, {user?.name}</span>
        <button className="btn-header" onClick={() => navigate('/change-password')}>Change Password</button>
        <button className="btn-logout" onClick={logout}>Logout</button>
      </div>
    </header>
  );
}

export default Header;