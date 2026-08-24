const config = require('./utils/config');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const compression = require('compression');
const z = require('zod');
const validator = require('validator');
const auth = require('./middlewares/auth');
const logger = require('./utils/logger');
const AppError = require('./utils/appError');
const { prisma } = require('./utils/prisma');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const Redis = require('ioredis');

const redis = new Redis(config.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: config.isTest ? () => null : (times) => Math.min(times * 200, 5000)
});

let redisLogged = false;
redis.on('error', (err) => {
    if (!redisLogged) {
        logger.warn(`Redis server offline (caching disabled, database fallback active): ${err.message}`);
        redisLogged = true;
    }
});
redis.on('ready', () => {
    if (redisLogged) {
        logger.info('Redis connection (re)established — caching enabled');
        redisLogged = false;
    }
});

const safeRedisGet = async (key) => {
    try {
        if (redis.status === 'ready') return await redis.get(key);
    } catch (err) {
        logger.warn(`Redis GET ignored: ${err.message}`);
    }
    return null;
};

const safeRedisSet = async (key, value, mode, duration) => {
    try {
        if (redis.status === 'ready') {
            if (mode && duration) await redis.set(key, value, mode, duration);
            else await redis.set(key, value);
        }
    } catch (err) {
        logger.warn(`Redis SET ignored: ${err.message}`);
    }
};

const safeRedisDel = async (key) => {
    try {
        if (redis.status === 'ready') await redis.del(key);
    } catch (err) {
        logger.warn(`Redis DEL ignored: ${err.message}`);
    }
};

const safeInvalidateUserNotesCache = async (userId) => {
    try {
        if (redis.status === 'ready') {
            const keys = await redis.keys(`notes:user:${userId}:*`);
            if (keys && keys.length > 0) {
                await redis.del(...keys);
            }
        }
    } catch (err) {
        logger.warn(`Redis cache invalidation ignored: ${err.message}`);
    }
};

const app = express();

app.set('trust proxy', config.TRUST_PROXY);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '100kb' }));

const rawAllowedOrigins = config.ALLOWED_ORIGIN
    ? config.ALLOWED_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4000'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || rawAllowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked: Origin ${origin} is not allowed`));
    },
    credentials: true
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests, try again later.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest
});
app.use('/api/', apiLimiter);

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
        if (res.statusCode >= 500) logger.error(message);
        else if (res.statusCode >= 400) logger.warn(message);
        else logger.http(message);
    });
    next();
});

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation Schemas
const NoteSchema = z.object({
    body: z.object({
        title: z.string().min(1, "Title is required").max(200).transform(val => validator.escape(val.trim())),
        content: z.string().min(1, "Content cannot be empty").max(10000, "Content is too long").transform(val => validator.escape(val.trim()))
    })
});

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'title'];

const QueryNoteSchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("10"),
        sort: z.enum(SORTABLE_FIELDS).optional().default("createdAt"),
        order: z.enum(["asc", "desc"]).optional().default("desc"),
        filter: z.record(z.string(), z.string()).optional().default({})
    })
});

const NoteIdSchema = z.object({
    params: z.object({
        id: z.coerce.number().int("Invalid note ID").positive("Invalid note ID")
    })
});

const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
        const validationError = new AppError("Validation Error", 400);
        validationError.details = result.error.issues.map(err => ({ field: err.path[1], message: err.message }));
        return next(validationError);
    }
    if (result.data.body) req.body = result.data.body;
    if (result.data.query) Object.defineProperty(req, 'query', { value: result.data.query, writable: true, configurable: true, enumerable: true });
    if (result.data.params) Object.defineProperty(req, 'params', { value: result.data.params, writable: true, configurable: true, enumerable: true });
    next();
};

// --- NOTE ROUTES ---

app.post("/api/v1/notes", auth.protect, validate(NoteSchema), catchAsync(async (req, res) => {
    const { title, content } = req.body;
    const userId = req.user.id;

    const newNote = await prisma.note.create({
        data: {
            title,
            content,
            userId
        }
    });

    await safeInvalidateUserNotesCache(userId);

    res.status(201).json({ success: true, data: newNote, message: "Note Created Successfully" });
}));

app.get("/api/v1/notes", auth.protect, validate(QueryNoteSchema), catchAsync(async (req, res) => {
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const { sort, order, filter } = req.query;
    const skip = (page - 1) * limit;

    const cacheKey = `notes:user:${userId}:page:${page}:limit:${limit}`;

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
        const parsedCache = JSON.parse(cached);
        const parsedNotes = parsedCache.notes || parsedCache;
        const totalCount = parsedCache.totalCount || parsedNotes.length;
        const totalPages = Math.ceil(totalCount / limit) || 1;
        return res.status(200).json({
            success: true,
            count: parsedNotes.length,
            totalCount,
            totalPages,
            page,
            limit,
            notes: parsedNotes,
            fromCache: true,
            message: "Notes Fetched Successfully"
        });
    }

    const where = { userId };
    if (filter.title) {
        where.title = { contains: filter.title, mode: 'insensitive' };
    }
    if (filter.content) {
        where.content = { contains: filter.content, mode: 'insensitive' };
    }

    const orderBy = { [sort]: order };

    const [notes, totalCount] = await Promise.all([
        prisma.note.findMany({
            where,
            skip,
            take: limit,
            orderBy
        }),
        prisma.note.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;
    await safeRedisSet(cacheKey, JSON.stringify({ notes, totalCount, totalPages }), 'EX', 60);

    res.status(200).json({
        success: true,
        count: notes.length,
        totalCount,
        totalPages,
        page,
        limit,
        notes,
        fromCache: false,
        message: "Notes Fetched Successfully"
    });
}));

app.get("/api/v1/notes/:id", auth.protect, validate(NoteIdSchema), catchAsync(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const cacheKey = `note:${id}`;

    const cached = await safeRedisGet(cacheKey);
    if (cached) {
        const parsedNote = JSON.parse(cached);
        if (parsedNote.userId !== userId) {
            throw new AppError("Note Not Found", 404);
        }
        return res.status(200).json({ success: true, note: parsedNote, fromCache: true, message: "Note Fetched Successfully" });
    }

    const currentNote = await prisma.note.findUnique({
        where: { id }
    });
    if (!currentNote || currentNote.userId !== userId) {
        throw new AppError("Note Not Found", 404);
    }

    await safeRedisSet(cacheKey, JSON.stringify(currentNote), 'EX', 300);

    res.status(200).json({ success: true, note: currentNote, fromCache: false, message: "Note Fetched Successfully" });
}));

app.put("/api/v1/notes/:id", auth.protect, validate(NoteIdSchema), validate(NoteSchema), catchAsync(async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;
    const userId = req.user.id;
    const cacheKey = `note:${id}`;

    const currentNote = await prisma.note.findUnique({ where: { id } });
    if (!currentNote) {
        throw new AppError("Note Not Found", 404);
    }
    if (currentNote.userId !== userId) {
        throw new AppError("Forbidden", 403);
    }

    const updatedNote = await prisma.note.update({
        where: { id },
        data: { title, content }
    });

    await safeRedisDel(cacheKey);
    await safeInvalidateUserNotesCache(userId);

    res.status(200).json({ success: true, updatedNote, message: "Note Updated Successfully" });
}));

app.delete("/api/v1/notes/:id", auth.protect, validate(NoteIdSchema), catchAsync(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const cacheKey = `note:${id}`;

    const currentNote = await prisma.note.findUnique({ where: { id } });
    if (!currentNote) {
        throw new AppError("Note Not Found", 404);
    }
    if (currentNote.userId !== userId) {
        throw new AppError("Forbidden", 403);
    }

    await prisma.note.delete({ where: { id } });

    await safeRedisDel(cacheKey);
    await safeInvalidateUserNotesCache(userId);

    res.status(200).json({ success: true, message: "Note Deleted Successfully" });
}));

// Operational endpoints
app.get("/health", (req, res) => {
    res.status(200).json({ status: 'ok', service: 'notes-service', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get("/ready", catchAsync(async (req, res) => {
    const checks = { database: 'down', redis: redis.status === 'ready' ? 'up' : 'down' };
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'up';
    } catch (err) {
        logger.error(`Notes service DB check failed: ${err.message}`);
    }
    const ready = checks.database === 'up';
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready', checks });
}));

app.use((req, res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
});

app.use((err, req, res, _next) => {
    logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, { stack: err.stack });

    let status = err.status || 500;
    let message = err.message || "Internal Server Error";

    if (err.code === "P2025") {
        status = 404;
        message = "Record not found";
    }

    res.status(status).json({
        success: false,
        message,
        ...(err.details && { errors: err.details }),
        ...(!config.isProd ? { stack: err.stack } : {})
    });
});

// --- HTTP SERVER & SOCKET.IO SETUP ---
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Socket.io Connection, Room Handling, and Persist & Broadcast Block
io.on('connection', (socket) => {
    logger.info(`🔌 Socket client connected: ${socket.id}`);

    // Join room
    socket.on('join-note', (noteId) => {
        const roomName = `note:${noteId}`;
        socket.join(roomName);
        logger.info(`👥 Socket ${socket.id} joined room ${roomName}`);
    });

    // Leave room
    socket.on('leave-note', (noteId) => {
        const roomName = `note:${noteId}`;
        socket.leave(roomName);
        logger.info(`👋 Socket ${socket.id} left room ${roomName}`);
    });

    // Block 2: Receive, Persist, Broadcast (Last-Write-Wins)
    socket.on('note:update', async ({ noteId, title, content, editedBy }) => {
        try {
            const id = Number(noteId);
            if (isNaN(id)) return;

            const updateData = {};
            if (title !== undefined) updateData.title = title;
            if (content !== undefined) updateData.content = content;

            // Persist to PostgreSQL via Prisma
            const updatedNote = await prisma.note.update({
                where: { id },
                data: updateData
            });

            // Invalidate Redis cache for this note
            await safeRedisDel(`note:${id}`);

            // Broadcast to everyone in the room EXCEPT the sender
            socket.to(`note:${noteId}`).emit('note:updated', {
                noteId,
                title: updatedNote.title,
                content: updatedNote.content,
                editedBy,
                updatedAt: updatedNote.updatedAt
            });

            logger.info(`📝 Note ${id} updated via socket by ${editedBy?.name || socket.id} and broadcasted`);
        } catch (err) {
            logger.error(`Error handling note:update via socket: ${err.message}`);
        }
    });

    socket.on('disconnect', () => {
        logger.info(`❌ Socket client disconnected: ${socket.id}`);
    });
});

app.io = io;

if (!config.isTest) {
    const port = process.env.NOTES_PORT || config.PORT || 4002;
    server.listen(port, '0.0.0.0', () => {
        logger.info(`Notes Service & Socket.io running on port ${port}`);
    });
    module.exports = server;
} else {
    module.exports = server;
}
