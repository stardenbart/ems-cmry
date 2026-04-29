import React, { useState, useEffect } from 'react';
import api from '../api/axios';

function SettingsSMTP() {
  const [form, setForm] = useState({ host: '', port: 465, username: '', password: '' });
  const [testEmail, setTestEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/settings/smtp')
      .then((res) => setForm(res.data))
      .catch((err) => console.error(err));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await api.put('/settings/smtp', form);
      setMessage('SMTP berhasil disimpan');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  };

  const handleTest = async () => {
    if (!testEmail) return alert('Masukkan email penerima untuk testing');
    try {
      const res = await api.post('/settings/smtp/test', { email: testEmail });
      setMessage(res.data.message);
      setTimeout(() => setMessage(''), 5000);
    } catch (err) { alert(err.response?.data?.error || 'Test gagal'); }
  };

  return (
    <div>
      <h2 className="page-title">SMTP Settings</h2>
      <div className="card">
        {message && <div style={{ background: '#d5f5e3', padding: 10, borderRadius: 4, marginBottom: 16, color: '#1e8449' }}>{message}</div>}

        <form onSubmit={handleSave} style={{ maxWidth: 500 }}>
          <div className="form-row">
            <div className="form-group">
              <label>Host</label>
              <input value={form.host || ''} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.example.com" />
            </div>
            <div className="form-group">
              <label>Port</label>
              <input type="number" value={form.port || 465} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })} />
            </div>
          </div>
          <div className="form-group">
            <label>Username / Email</label>
            <input value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="example@example.com" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" className="btn" style={{ border: '1px solid #ccc' }} onClick={() => setForm({ host: '', port: 465, username: '', password: '' })}>Cancel</button>
          </div>
        </form>

        <hr style={{ margin: '24px 0', borderColor: '#eee' }} />

        <h4>Test Send Email</h4>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', maxWidth: 500 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Send Alarm To</label>
            <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="recipient@example.com" />
          </div>
          <button type="button" className="btn btn-success" onClick={handleTest} style={{ marginBottom: 16 }}>Test Send Email</button>
        </div>
      </div>
    </div>
  );
}

export default SettingsSMTP;