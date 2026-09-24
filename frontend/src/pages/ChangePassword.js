import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';

// Dipakai dua cara: ganti password biasa dari menu, dan ganti password WAJIB
// (?required=1) untuk akun yang masih memakai password bawaan. Pada mode wajib,
// seluruh endpoint lain menjawab 428 sampai password diganti, jadi halaman ini
// tidak boleh punya jalan keluar selain menyelesaikannya atau logout.

function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('ems_user') || 'null'); } catch (e) { saved = null; }
  const required = new URLSearchParams(location.search).get('required') === '1'
    || (saved && saved.must_change_password === true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (form.newPassword !== form.confirmPassword) {
      return setError('The new password and its confirmation do not match');
    }
    if (form.newPassword.length < 8) {
      return setError('The new password must be at least 8 characters');
    }

    setLoading(true);
    try {
      const res = await api.put('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      // Token lama masih membawa penanda password bawaan; pakai yang baru.
      if (res.data.token) localStorage.setItem('ems_token', res.data.token);
      if (res.data.user) localStorage.setItem('ems_user', JSON.stringify(res.data.user));
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      if (required) {
        // Muat ulang penuh supaya konteks auth membaca profil yang baru.
        window.location.href = '/realtime/device';
        return;
      }
      setMessage(res.data.message || 'Password changed');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change the password');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('ems_token');
    localStorage.removeItem('ems_user');
    window.location.href = '/login';
  };

  return (
    <div>
      <h2 className="page-title">Change Password</h2>
      <div className="card" style={{ maxWidth: 450 }}>
        {required && (
          <div style={{ background: '#fef5e7', color: '#9c640c', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, border: '1px solid #f8c471' }}>
            This account still uses its default password. Choose a new one to continue using the system.
          </div>
        )}
        {message && (
          <div style={{ background: '#d5f5e3', color: '#1e8449', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, border: '1px solid #a9dfbf' }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ background: '#fdeaea', color: '#c0392b', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, border: '1px solid #f5c6cb' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Current password</label>
            <input type="password" value={form.currentPassword} autoComplete="current-password"
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>New password</label>
            <input type="password" value={form.newPassword} autoComplete="new-password"
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
            <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 4 }}>
              At least 8 characters, different from the current password and the username.
            </div>
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input type="password" value={form.confirmPassword} autoComplete="new-password"
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Change password'}
            </button>
            {required ? (
              <button type="button" className="btn btn-outline" onClick={logout}>Log out</button>
            ) : (
              <button type="button" className="btn btn-outline" onClick={() => navigate('/realtime/device')}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePassword;
