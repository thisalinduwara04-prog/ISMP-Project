import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({ baseURL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ispm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Centralised 401 handling: drop the stale token and bounce to /login,
// rather than every page having to catch this individually.
client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('ispm_token')) {
      localStorage.removeItem('ispm_token');
      localStorage.removeItem('ispm_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
