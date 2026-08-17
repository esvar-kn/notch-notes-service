import api from './api';

export const authService = {
  /**
   * Log in user using Axios
   * @param {Object} credentials { email, password }
   */
  async login(credentials) {
    const response = await api.post('/users/login', credentials);
    return response.data;
  },

  /**
   * Register new user using Axios
   * @param {Object} userData { name, email, password }
   */
  async register(userData) {
    const response = await api.post('/users/register', userData);
    return response.data;
  },
};
