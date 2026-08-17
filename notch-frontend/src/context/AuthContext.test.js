import { authReducer, AUTH_ACTIONS, getInitialAuthState } from './authReducer.js';

// Helper mock for localStorage
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

export function runAuthPersistenceTests() {
  const results = [];
  const mockStorage = createMockLocalStorage();

  // 1. Initial State without token
  let state = getInitialAuthState(mockStorage);

  results.push({
    test: '1. Initial State - Unauthenticated when localStorage is empty',
    passed: state.token === null && state.isAuthenticated === false && state.user === null,
  });

  // 2. Simulate Signup & Login Action
  const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-jwt-token-payload';
  const sampleUser = { name: 'Jane Doe', email: 'jane@example.com' };

  const loginAction = {
    type: AUTH_ACTIONS.LOGIN_SUCCESS,
    payload: { token: sampleToken, user: sampleUser },
  };

  state = authReducer(state, loginAction, mockStorage);

  const tokenStoredInLocalStorage = mockStorage.getItem('token') === sampleToken;
  const userStoredInLocalStorage = mockStorage.getItem('user') === JSON.stringify(sampleUser);

  results.push({
    test: '2. Dispatch LOGIN_SUCCESS - Updates state & persists token/user in localStorage',
    passed:
      state.isAuthenticated === true &&
      state.token === sampleToken &&
      state.user.email === 'jane@example.com' &&
      tokenStoredInLocalStorage &&
      userStoredInLocalStorage,
  });

  // 3. Simulate Page Refresh (Re-initialization from localStorage)
  const refreshedState = getInitialAuthState(mockStorage);

  results.push({
    test: '3. Page Refresh - Hydrates state from localStorage (token persists)',
    passed:
      refreshedState.isAuthenticated === true &&
      refreshedState.token === sampleToken &&
      refreshedState.user?.name === 'Jane Doe' &&
      refreshedState.user?.email === 'jane@example.com',
  });

  // 4. Logout Action
  const logoutAction = { type: AUTH_ACTIONS.LOGOUT };
  const loggedOutState = authReducer(refreshedState, logoutAction, mockStorage);

  results.push({
    test: '4. Dispatch LOGOUT - Clears state & removes token from localStorage',
    passed:
      loggedOutState.isAuthenticated === false &&
      loggedOutState.token === null &&
      mockStorage.getItem('token') === null &&
      mockStorage.getItem('user') === null,
  });

  return results;
}

const testResults = runAuthPersistenceTests();
console.log('\n======================================================');
console.log('  TEST SUITE: SIGNUP → LOGIN → REFRESH TOKEN PERSISTENCE');
console.log('======================================================');
let allPassed = true;
testResults.forEach((r) => {
  console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.test}`);
  if (!r.passed) allPassed = false;
});
console.log('======================================================');
if (allPassed) {
  console.log('RESULT: ALL TESTS PASSED SUCCESSFULLY! Token persistence verified.\n');
} else {
  console.log('RESULT: SOME TESTS FAILED.\n');
  process.exit(1);
}
