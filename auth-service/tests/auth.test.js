const request = require('supertest');
const app = require('../server');
const { prisma, pool } = require('../utils/prisma');

describe('Auth Service Integration Tests (Jest + Supertest)', () => {
    let testUser;
    let authToken;
    let userId;

    beforeAll(async () => {
        testUser = {
            name: 'Test Runner User',
            email: `jest_test_${Date.now()}@example.com`,
            password: 'Password123!'
        };
    });

    afterAll(async () => {
        // Cleanup test database user records
        try {
            await prisma.user.deleteMany({
                where: { email: { contains: 'jest_test_' } }
            });
            await prisma.$disconnect();
            await pool.end();
        } catch (err) {
            // Ignore disconnect errors during teardown
        }
    });

    describe('GET /health & GET /ready', () => {
        it('returns 200 for health check', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.service).toBe('auth-service');
        });

        it('returns 200 for readiness check', async () => {
            const res = await request(app).get('/ready');
            expect(res.status).toBe(200);
            expect(res.body.database).toBe('up');
        });
    });

    describe('POST /api/v1/auth/register', () => {
        it('returns 201 and registers user for valid credentials', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send(testUser);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.email).toBe(testUser.email.toLowerCase());
            expect(res.body.data.name).toBe(testUser.name);
        });

        it('returns 409 failure when registering with duplicate email', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send(testUser);

            expect(res.status).toBe(409);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/already exists/i);
        });

        it('returns 400 validation error for short password (< 8 chars)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    name: 'Short Pass User',
                    email: `short_${Date.now()}@example.com`,
                    password: '123'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Validation Error');
        });
    });

    describe('POST /api/v1/auth/login', () => {
        it('returns 200 and a valid JWT token for valid credentials', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('token');
            authToken = res.body.data.token;

            // Fetch userId from DB to use in profile update test
            const dbUser = await prisma.user.findUnique({ where: { email: testUser.email.toLowerCase() } });
            userId = dbUser.id;
        });

        it('returns 401 failure for incorrect password', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: testUser.email,
                    password: 'WrongPassword999!'
                });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/invalid email or password/i);
        });

        it('returns 401 failure for non-existent user email', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'nonexistent_user_99999@example.com',
                    password: 'Password123!'
                });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });

    describe('PUT /api/v1/auth/user (Protected Profile Update)', () => {
        it('returns 401 for malformed JWT token', async () => {
            const res = await request(app)
                .put('/api/v1/auth/user')
                .set('Authorization', 'Bearer malformed_invalid_jwt_token')
                .send({ id: 1, name: 'Hacked Name' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('returns 403 when trying to update another user ID profile', async () => {
            const res = await request(app)
                .put('/api/v1/auth/user')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ id: 999999, name: 'Impersonated Name' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/unauthorized profile modification/i);
        });

        it('returns 200 when updating own user profile', async () => {
            const res = await request(app)
                .put('/api/v1/auth/user')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ id: userId, name: 'Updated Runner Name' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.updatedUser.name).toBe('Updated Runner Name');
        });
    });
});
