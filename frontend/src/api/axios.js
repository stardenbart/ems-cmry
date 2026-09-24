import axios from 'axios';

const api = axios.create({
  baseURL: 'http://172.104.1.81:3010/api',
});

// Interceptor: tambahkan token ke setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ems_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor: 401 = sesi habis -> login. 428 = password bawaan belum diganti ->
// halaman ganti password. Dulu 428 tidak ditangani sama sekali, sehingga guard
// password bawaan membuat seluruh halaman kosong tanpa penjelasan.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 428) {
      if (!window.location.pathname.startsWith('/change-password')) {
        window.location.href = '/change-password?required=1';
      }
      return Promise.reject(error);
    }
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('ems_token');
      localStorage.removeItem('ems_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;