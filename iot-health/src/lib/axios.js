import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
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
