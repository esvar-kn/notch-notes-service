import { describe, it, expect } from 'vitest';
import { authReducer, AUTH_ACTIONS, getInitialAuthState } from './authReducer.js';

const createMockLocalStorage = () => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    getStore: () => store,
  };
};

describe('AuthContext & Reducer Tests', () => {
  it('initializes as unauthenticated when localStorage is empty', () => {
    const mockStorage = createMockLocalStorage();
    const state = getInitialAuthState(mockStorage);
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('updates state and persists token/user on LOGIN_SUCCESS', () => {
    const mockStorage = createMockLocalStorage();
    let state = getInitialAuthState(mockStorage);
    const sampleToken = 'test-jwt-token';
    const sampleUser = { name: 'Jane Doe', email: 'jane@example.com' };

    state = authReducer(state, { type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { token: sampleToken, user: sampleUser } }, mockStorage);

    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe(sampleToken);
    expect(mockStorage.getItem('token')).toBe(sampleToken);
  });

  it('hydrates state from localStorage on page refresh', () => {
    const mockStorage = createMockLocalStorage();
    mockStorage.setItem('token', 'stored-token');
    mockStorage.setItem('user', JSON.stringify({ name: 'Jane Doe' }));

    const state = getInitialAuthState(mockStorage);
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('stored-token');
  });

  it('clears state and localStorage on LOGOUT', () => {
    const mockStorage = createMockLocalStorage();
    mockStorage.setItem('token', 'stored-token');
    const state = getInitialAuthState(mockStorage);

    const loggedOut = authReducer(state, { type: AUTH_ACTIONS.LOGOUT }, mockStorage);
    expect(loggedOut.isAuthenticated).toBe(false);
    expect(mockStorage.getItem('token')).toBeNull();
  });
});
