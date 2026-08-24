const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { prisma, pool } = require('../utils/prisma');
const config = require('../utils/config');

describe('Notes Service Integration Tests (Jest + Supertest)', () => {
    let user1Token;
    let user2Token;
    let user1Id;
    let user2Id;
    let testNoteId;

    beforeAll(async () => {
        // Create 2 test users directly in DB for JWT payload testing
        const user1 = await prisma.user.create({
            data: {
                name: 'Notes User One',
                email: `notes_user1_${Date.now()}@example.com`,
                password: 'HashedPassword123!'
            }
        });
        user1Id = user1.id;
        user1Token = jwt.sign({ id: user1.id, email: user1.email }, config.JWT_SECRET, { expiresIn: '1h' });

        const user2 = await prisma.user.create({
            data: {
                name: 'Notes User Two',
                email: `notes_user2_${Date.now()}@example.com`,
                password: 'HashedPassword123!'
            }
        });
        user2Id = user2.id;
        user2Token = jwt.sign({ id: user2.id, email: user2.email }, config.JWT_SECRET, { expiresIn: '1h' });
    });

    afterAll(async () => {
        // Cleanup test data
        try {
            await prisma.note.deleteMany({
                where: { userId: { in: [user1Id, user2Id] } }
            });
            await prisma.user.deleteMany({
                where: { id: { in: [user1Id, user2Id] } }
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
            expect(res.body.service).toBe('notes-service');
        });

        it('returns 200 for readiness check', async () => {
            const res = await request(app).get('/ready');
            expect(res.status).toBe(200);
            expect(res.body.checks.database).toBe('up');
        });
    });

    describe('POST /api/v1/notes (Create Note)', () => {
        it('returns 201 and creates note for authenticated user', async () => {
            const res = await request(app)
                .post('/api/v1/notes')
                .set('Authorization', `Bearer ${user1Token}`)
                .send({
                    title: 'Jest Test Note Title',
                    content: 'Testing note creation via Jest and Supertest'
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('id');
            expect(res.body.data.userId).toBe(user1Id);
            testNoteId = res.body.data.id;
        });

        it('returns 401 failure when request lacks Authorization header', async () => {
            const res = await request(app)
                .post('/api/v1/notes')
                .send({
                    title: 'Unauthorized Note',
                    content: 'Should fail'
                });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/not authorized/i);
        });

        it('returns 401 failure when JWT token is invalid/malformed', async () => {
            const res = await request(app)
                .post('/api/v1/notes')
                .set('Authorization', 'Bearer invalid_malformed_token')
                .send({
                    title: 'Invalid Token Note',
                    content: 'Should fail'
                });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('returns 400 failure for empty title/content validation failure', async () => {
            const res = await request(app)
                .post('/api/v1/notes')
                .set('Authorization', `Bearer ${user1Token}`)
                .send({
                    title: '',
                    content: ''
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Validation Error');
        });
    });

    describe('GET /api/v1/notes (Read Notes List)', () => {
        it('returns 200 and list of notes for authenticated user', async () => {
            const res = await request(app)
                .get('/api/v1/notes')
                .set('Authorization', `Bearer ${user1Token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.notes)).toBe(true);
            expect(res.body.notes.length).toBeGreaterThanOrEqual(1);
        });

        it('returns 401 failure for unauthenticated request', async () => {
            const res = await request(app).get('/api/v1/notes');
            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/notes/:id (Read Single Note)', () => {
        it('returns 200 and the note object for owner', async () => {
            const res = await request(app)
                .get(`/api/v1/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${user1Token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.note.id).toBe(testNoteId);
        });

        it('returns 400 validation error for non-integer note ID format', async () => {
            const res = await request(app)
                .get('/api/v1/notes/invalid_string_id')
                .set('Authorization', `Bearer ${user1Token}`);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Validation Error');
        });

        it('returns 404 when User 2 attempts to view User 1 note', async () => {
            const res = await request(app)
                .get(`/api/v1/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${user2Token}`);

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/note not found/i);
        });

        it('returns 404 for non-existent note ID', async () => {
            const res = await request(app)
                .get('/api/v1/notes/999999')
                .set('Authorization', `Bearer ${user1Token}`);

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
        });
    });

    describe('PUT /api/v1/notes/:id (Update Note)', () => {
        it('returns 200 and updates note content for owner', async () => {
            const res = await request(app)
                .put(`/api/v1/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${user1Token}`)
                .send({
                    title: 'Updated Note Title',
                    content: 'Updated content body'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.updatedNote.title).toBe('Updated Note Title');
        });

        it('returns 403 Forbidden when User 2 attempts to edit User 1 note', async () => {
            const res = await request(app)
                .put(`/api/v1/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${user2Token}`)
                .send({
                    title: 'Hacked Note Title',
                    content: 'Attempting unauthorized edit'
                });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Forbidden');
        });
    });

    describe('DELETE /api/v1/notes/:id (Delete Note)', () => {
        it('returns 403 Forbidden when User 2 attempts to delete User 1 note', async () => {
            const res = await request(app)
                .delete(`/api/v1/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${user2Token}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Forbidden');
        });

        it('returns 200 and deletes note for owner', async () => {
            const res = await request(app)
                .delete(`/api/v1/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${user1Token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toMatch(/deleted successfully/i);
        });

        it('returns 404 when deleting an already deleted note', async () => {
            const res = await request(app)
                .delete(`/api/v1/notes/${testNoteId}`)
                .set('Authorization', `Bearer ${user1Token}`);

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
        });
    });
});
