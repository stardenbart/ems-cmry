import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ems_token');
    const savedUser = localStorage.getItem('ems_user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      // Verifikasi token masih valid
      api.get('/auth/me')
        .then((res) => {
          setUser(res.data);
          localStorage.setItem('ems_user', JSON.stringify(res.data));
        })
        .catch(() => {
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('ems_token', token);
    localStorage.setItem('ems_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('ems_token');
    localStorage.removeItem('ems_user');
    setUser(null);
  };

  // Cek apakah user punya akses ke halaman tertentu
  const hasAccess = (page) => {
    if (!user) return false;
    const { level } = user;

    const accessMap = {
      admin: ['realtime', 'dashboard', 'report', 'alarm', 'settings'],
      maintenance: ['realtime', 'dashboard', 'report-basic', 'alarm', 'settings-limited'],
      operator: ['realtime', 'dashboard', 'report-basic', 'alarm'],
      viewer: ['realtime', 'dashboard'],
    };

    const allowed = accessMap[level] || [];

    if (allowed.includes(page)) return true;
    // Settings sub-check
    if (page === 'settings' && level === 'maintenance') return false;
    if (page === 'settings-limited' && level === 'maintenance') return true;

    return false;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, hasAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}