const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../index');
const { prisma } = require('../utils/prisma');

// One teardown for the whole file — runs after every describe block, so the
// shared pool stays open until all tests (including /ready) have finished.
after(async () => {
    await prisma.user.deleteMany();
    await app.shutdownDependencies();
});

// Helper: register a user then log in, returning the bearer token.
async function registerAndLogin({ name = 'Test User', email, password = 'password123' }) {
    await request(app).post('/api/v1/users/register').send({ name, email, password });
    const res = await request(app).post('/api/v1/users/login').send({ email, password });
    return res.body.data.token;
}

describe('Integration: Users & Notes on PostgreSQL', () => {
    before(async () => {
        // Prove the DB is reachable before running the suite (fail loud otherwise).
        await prisma.$queryRaw`SELECT 1`;
    });

    beforeEach(async () => {
        // Isolate each test — deleting users cascades to their notes.
        await prisma.user.deleteMany();
    });

    describe('User lifecycle', () => {
        it('registers a new user (201)', async () => {
            const res = await request(app)
                .post('/api/v1/users/register')
                .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

            assert.equal(res.status, 201);
            assert.equal(res.body.success, true);
            assert.equal(res.body.data.email, 'alice@example.com');
            assert.equal(res.body.data.password, undefined, 'password must never be returned');
        });

        it('rejects a duplicate email (409)', async () => {
            await request(app).post('/api/v1/users/register')
                .send({ name: 'Alice', email: 'dupe@example.com', password: 'password123' });
            const res = await request(app).post('/api/v1/users/register')
                .send({ name: 'Alice2', email: 'dupe@example.com', password: 'password123' });

            assert.equal(res.status, 409);
            assert.equal(res.body.success, false);
        });

        it('normalises email to lowercase on register and login', async () => {
            await request(app).post('/api/v1/users/register')
                .send({ name: 'Case', email: 'MixedCase@Example.com', password: 'password123' });
            const res = await request(app).post('/api/v1/users/login')
                .send({ email: 'mixedcase@example.com', password: 'password123' });

            assert.equal(res.status, 200);
            assert.ok(res.body.data.token);
        });

        it('rejects login with the wrong password (401, generic message)', async () => {
            await request(app).post('/api/v1/users/register')
                .send({ name: 'Bob', email: 'bob@example.com', password: 'password123' });
            const res = await request(app).post('/api/v1/users/login')
                .send({ email: 'bob@example.com', password: 'wrongpassword' });

            assert.equal(res.status, 401);
            assert.equal(res.body.message, 'Invalid email or password');
        });

        it('lets a user update their own profile', async () => {
            const token = await registerAndLogin({ email: 'self@example.com' });
            const user = await prisma.user.findUnique({ where: { email: 'self@example.com' } });

            const res = await request(app)
                .put('/api/v1/users')
                .set('Authorization', `Bearer ${token}`)
                .send({ id: user.id, name: 'Renamed' });

            assert.equal(res.status, 200);
            assert.equal(res.body.updatedUser.name, 'Renamed');
            assert.equal(res.body.updatedUser.password, undefined);
        });

        it('forbids updating another user\'s profile (403)', async () => {
            const tokenA = await registerAndLogin({ email: 'a-owner@example.com' });
            await registerAndLogin({ email: 'b-other@example.com' });
            const victim = await prisma.user.findUnique({ where: { email: 'b-other@example.com' } });

            const res = await request(app)
                .put('/api/v1/users')
                .set('Authorization', `Bearer ${tokenA}`)
                .send({ id: victim.id, name: 'Hacked' });

            assert.equal(res.status, 403);
        });
    });

    describe('Note CRUD', () => {
        it('creates, reads, lists, updates and deletes a note', async () => {
            const token = await registerAndLogin({ email: 'crud@example.com' });
            const authHeader = { Authorization: `Bearer ${token}` };

            // Create
            const created = await request(app).post('/api/v1/notes').set(authHeader)
                .send({ title: 'First', content: 'Hello world' });
            assert.equal(created.status, 201);
            const noteId = created.body.data.id;
            assert.ok(Number.isInteger(noteId));

            // Read by id
            const fetched = await request(app).get(`/api/v1/notes/${noteId}`).set(authHeader);
            assert.equal(fetched.status, 200);
            assert.equal(fetched.body.note.title, 'First');

            // List
            const listed = await request(app).get('/api/v1/notes').set(authHeader);
            assert.equal(listed.status, 200);
            assert.equal(listed.body.totalCount, 1);
            assert.equal(listed.body.notes.length, 1);

            // Update
            const updated = await request(app).put(`/api/v1/notes/${noteId}`).set(authHeader)
                .send({ title: 'Updated', content: 'Changed' });
            assert.equal(updated.status, 200);
            assert.equal(updated.body.updatedNote.title, 'Updated');

            // Delete
            const deleted = await request(app).delete(`/api/v1/notes/${noteId}`).set(authHeader);
            assert.equal(deleted.status, 200);

            const gone = await request(app).get(`/api/v1/notes/${noteId}`).set(authHeader);
            assert.equal(gone.status, 404);
        });

        it('returns 400 for a non-numeric note id', async () => {
            const token = await registerAndLogin({ email: 'badid@example.com' });
            const res = await request(app).get('/api/v1/notes/abc')
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 400);
            assert.equal(res.body.message, 'Validation Error');
        });

        it('escapes HTML in note content (XSS defence)', async () => {
            const token = await registerAndLogin({ email: 'xss@example.com' });
            const res = await request(app).post('/api/v1/notes')
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'x', content: '<script>alert(1)</script>' });

            assert.equal(res.status, 201);
            assert.ok(!res.body.data.content.includes('<script>'));
        });
    });

    describe('Ownership isolation', () => {
        it('prevents another user from reading, updating, or deleting a note', async () => {
            const tokenA = await registerAndLogin({ email: 'owner@example.com' });
            const tokenB = await registerAndLogin({ email: 'intruder@example.com' });

            const created = await request(app).post('/api/v1/notes')
                .set('Authorization', `Bearer ${tokenA}`)
                .send({ title: 'Private', content: 'secret' });
            const noteId = created.body.data.id;

            const read = await request(app).get(`/api/v1/notes/${noteId}`)
                .set('Authorization', `Bearer ${tokenB}`);
            assert.equal(read.status, 404, 'other users must not read the note');

            const update = await request(app).put(`/api/v1/notes/${noteId}`)
                .set('Authorization', `Bearer ${tokenB}`)
                .send({ title: 'Hijacked', content: 'nope' });
            assert.equal(update.status, 403);

            const del = await request(app).delete(`/api/v1/notes/${noteId}`)
                .set('Authorization', `Bearer ${tokenB}`);
            assert.equal(del.status, 403);
        });
    });

    describe('Regression: delete-user cascade + email reuse', () => {
        it('does not leak the previous account\'s notes when an email is reused', async () => {
            // Original account creates a note, then deletes itself.
            const tokenA = await registerAndLogin({ email: 'reuse@example.com' });
            await request(app).post('/api/v1/notes').set('Authorization', `Bearer ${tokenA}`)
                .send({ title: 'Old', content: 'from the deleted account' });

            const delAcct = await request(app).delete('/api/v1/users')
                .set('Authorization', `Bearer ${tokenA}`);
            assert.equal(delAcct.status, 200);

            // Cascade should have removed the note along with the user.
            const remainingNotes = await prisma.note.count();
            assert.equal(remainingNotes, 0, 'notes must be cascade-deleted with the user');

            // A brand-new account reusing the same email must start empty.
            const tokenB = await registerAndLogin({ email: 'reuse@example.com' });
            const list = await request(app).get('/api/v1/notes')
                .set('Authorization', `Bearer ${tokenB}`);
            assert.equal(list.status, 200);
            assert.equal(list.body.totalCount, 0, 'reused email must not inherit old notes');
        });
    });
});

describe('Operational endpoints', () => {
    it('GET /health returns ok without touching dependencies', async () => {
        const res = await request(app).get('/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
    });

    it('GET /ready reports the database as up', async () => {
        const res = await request(app).get('/ready');
        assert.equal(res.status, 200);
        assert.equal(res.body.checks.database, 'up');
    });
});
