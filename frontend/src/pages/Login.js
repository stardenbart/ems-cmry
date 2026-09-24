import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import { isDesktopApp } from '../components/Layout/Sidebar';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await login(username, password);
      navigate(u && u.must_change_password ? '/change-password?required=1' : '/realtime/device');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/Logo_Cimory.png" alt="Cimory" style={{ width: 250, marginBottom: 16 }} />
        <h1>Energy Monitoring System</h1>
        <p className="login-subtitle">PT Cisarua Mountain Dairy, Tbk — Plant Sentul</p>

        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <div className="form-group">
            <input type="text" placeholder="Username" value={username}
              onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <input type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        {!isDesktopApp() ? (
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12 }}>
            <a href="/download/EMS-Desktop.exe" download style={{ color: '#1B4F72' }}>
              Download the EMS desktop app
            </a>
            <span style={{ color: '#95a5a6' }}> — opens EMS from a desktop icon, no browser needed</span>
          </div>
        ) : null}

        <div className="login-footer">
          Powered by Digital Transformation Plant Sentul
        </div>
      </div>
    </div>
  );
}

export default Login;