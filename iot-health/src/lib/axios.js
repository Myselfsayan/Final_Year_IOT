import axios from 'axios';

// Robustly build the base URL:
// - Accept VITE_API_URL as just the domain OR the full /api/users path
// - Always normalise to https://your-backend.com/api/users/
// - Trailing slash is required so Axios appends relative paths correctly
//   e.g.  baseURL="…/api/users/"  +  "login"  →  "…/api/users/login"  ✅
const _raw = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const _domain = _raw.replace(/\/api\/users\/?$/, '').replace(/\/$/, '');
const BASE_URL = `${_domain}/api/users/`;

const api = axios.create({
  baseURL: BASE_URL,
});

// Attach the JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global 401 handler — clears session and forces re-login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear stale session data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Redirect to login (works on both desktop and mobile)
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
