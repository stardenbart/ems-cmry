import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (form.newPassword !== form.confirmPassword) {
      return setError('Password baru dan konfirmasi tidak cocok');
    }

    if (form.newPassword.length < 4) {
      return setError('Password baru minimal 4 karakter');
    }

    setLoading(true);
    try {
      const res = await api.put('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setMessage(res.data.message);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal mengubah password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Change Password</h2>
      <div className="card" style={{ maxWidth: 450 }}>
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
            <label>Password Lama</label>
            <input type="password" value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Password Baru</label>
            <input type="password" value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Konfirmasi Password Baru</label>
            <input type="password" value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Menyimpan...' : 'Ubah Password'}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => navigate('/realtime/device')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePassword;