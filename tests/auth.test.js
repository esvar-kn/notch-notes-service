const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../index');

describe('Auth Routes & Middleware Security Integration Tests', () => {
  after(async () => {
    await app.shutdownDependencies();
  });

  it('POST /api/v1/users/register - Rejects registration when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/users/register')
      .send({ email: 'invalid-email-format' });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Validation Error');
  });

  it('POST /api/v1/users/login - Rejects login when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/users/login')
      .send({ email: 'test@example.com' });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Validation Error');
  });

  it('PUT /api/v1/users - Rejects profile update when no token is provided (401 Unauthorized)', async () => {
    const res = await request(app)
      .put('/api/v1/users')
      .send({ name: 'New Name' });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Not authorized, no token.');
  });

  it('GET /api/v1/notes - Rejects protected data access with corrupt Bearer token (401 Unauthorized)', async () => {
    const res = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', 'Bearer invalid.corrupted.jwt.token');

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Not authorized, token failed.');
  });
});
