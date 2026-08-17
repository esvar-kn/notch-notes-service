import axios from 'axios';

const rawEnvUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : '';
const API_BASE_URL = rawEnvUrl ? rawEnvUrl.trim().replace(/\/+$/, '') : '/api/v1';

/**
 * Custom Axios instance for the Notch API
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor: Automatically attach Authorization token if available in localStorage
 */
api.interceptors.request.use(
  (config) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor: Handle 401 Unauthorized errors globally
 */
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear invalid/expired token and user data from localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }

      // Dispatch custom event to notify AuthContext for SPA routing
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }

    // Extract user-friendly error message from backend response if available
    const customErrorMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';

    const enhancedError = new Error(customErrorMessage);
    enhancedError.status = error.response?.status;
    enhancedError.data = error.response?.data;

    return Promise.reject(enhancedError);
  }
);

export default api;
