import { describe, it, expect } from 'vitest';
import api from './api.js';

describe('Axios Service Layer & Interceptor Tests', () => {
  it('attaches Bearer token header from localStorage on request', () => {
    const sampleToken = 'test-jwt-token';
    localStorage.setItem('token', sampleToken);

    const requestConfig = { headers: {} };
    const requestInterceptor = api.interceptors.request.handlers[0]?.fulfilled;

    if (requestInterceptor) {
      const updatedConfig = requestInterceptor(requestConfig);
      expect(updatedConfig.headers.Authorization).toBe(`Bearer ${sampleToken}`);
    }
  });

  it('handles 401 response by clearing localStorage and dispatching unauthorized event', async () => {
    localStorage.setItem('token', 'expired-token');

    let eventDispatched = false;
    window.dispatchEvent = (event) => {
      if (event.type === 'auth:unauthorized') {
        eventDispatched = true;
      }
    };

    const responseInterceptorError = api.interceptors.response.handlers[0]?.rejected;
    const mock401Error = {
      response: {
        status: 401,
        data: { message: 'Token expired or invalid' },
      },
    };

    if (responseInterceptorError) {
      await expect(responseInterceptorError(mock401Error)).rejects.toThrow('Token expired or invalid');
      expect(localStorage.getItem('token')).toBeNull();
      expect(eventDispatched).toBe(true);
    }
  });
});
