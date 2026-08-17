import api from './api.js';

export async function runAxiosInterceptorTests() {
  const results = [];

  // Mock localStorage
  let store = {};
  const mockStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
  global.localStorage = mockStorage;

  // Test 1: Request Interceptor attaching token header
  const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-payload';
  mockStorage.setItem('token', sampleToken);

  const requestConfig = { headers: {} };
  const requestInterceptor = api.interceptors.request.handlers[0]?.fulfilled;
  if (requestInterceptor) {
    const updatedConfig = requestInterceptor(requestConfig);
    results.push({
      test: '1. Request Interceptor - Attaches Bearer token header from localStorage',
      passed: updatedConfig.headers.Authorization === `Bearer ${sampleToken}`,
    });
  }

  // Test 2: Response Interceptor handling 401 Unauthorized
  let eventDispatched = false;
  global.window = {
    location: { pathname: '/dashboard', href: '/dashboard' },
    dispatchEvent: (event) => {
      if (event.type === 'auth:unauthorized') {
        eventDispatched = true;
      }
    },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
  };

  const responseInterceptorError = api.interceptors.response.handlers[0]?.rejected;
  const mock401Error = {
    response: {
      status: 401,
      data: { message: 'Token expired or invalid' },
    },
  };

  if (responseInterceptorError) {
    try {
      await responseInterceptorError(mock401Error);
    } catch (err) {
      const tokenCleared = mockStorage.getItem('token') === null;
      results.push({
        test: '2. Response Interceptor (401) - Clears localStorage, dispatches event & formats error',
        passed: tokenCleared && eventDispatched && err.message === 'Token expired or invalid',
      });
    }
  }

  return results;
}

const testResults = await runAxiosInterceptorTests();
console.log('\n======================================================');
console.log('  TEST SUITE: AXIOS SERVICE LAYER & 401 INTERCEPTOR');
console.log('======================================================');
let allPassed = true;
testResults.forEach((r) => {
  console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.test}`);
  if (!r.passed) allPassed = false;
});
console.log('======================================================');
if (allPassed) {
  console.log('RESULT: ALL AXIOS INTERCEPTOR TESTS PASSED!\n');
} else {
  console.log('RESULT: SOME TESTS FAILED.\n');
  process.exit(1);
}
