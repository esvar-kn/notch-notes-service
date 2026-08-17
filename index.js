// Load & validate configuration before anything else reads process.env.
const config = require('./utils/config');
const express = require('express');
const compression = require('compression');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const z = require('zod');
const auth = require("./middlewares/auth");
const logger = require("./utils/logger");
const AppError = require("./utils/appError");
const { prisma, pool } = require("./utils/prisma");
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const helmet = require('helmet');
const cors = require('cors');
const validator = require('validator');

const Redis = require('ioredis');
// Resilient client: outside tests, reconnect with capped backoff so a transient
// Redis outage self-heals. Commands fail fast (no offline queue) so the
// DB-fallback path and the rate limiter never hang while Redis is unavailable.
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
        if (redis.status === 'ready') {
            return await redis.get(key);
        }
    } catch (err) {
        logger.warn(`Redis GET ignored: ${err.message}`);
    }
    return null;
};

const safeRedisSet = async (key, value, mode, duration) => {
    try {
        if (redis.status === 'ready') {
            if (mode && duration) {
                await redis.set(key, value, mode, duration);
            } else {
                await redis.set(key, value);
            }
        }
    } catch (err) {
        logger.warn(`Redis SET ignored: ${err.message}`);
    }
};

const safeRedisDel = async (key) => {
    try {
        if (redis.status === 'ready') {
            await redis.del(key);
        }
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
const SALT_ROUNDS = config.SALT_ROUNDS;
const JWT_SECRET = config.JWT_SECRET;
const JWT_EXPIRY = config.JWT_EXPIRY;

// Trust the platform proxy (Railway = 1 hop) so req.ip / rate limiting see the
// real client address rather than the proxy's.
app.set('trust proxy', config.TRUST_PROXY);

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '100kb' }));
const rawAllowedOrigins = config.ALLOWED_ORIGIN
    ? config.ALLOWED_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || rawAllowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked: Origin ${origin} is not allowed`));
    },
    credentials: true
}));

// Rate-limit factory — uses a shared Redis store across instances when Redis is
// configured, falling back to per-instance memory otherwise. `passOnStoreError`
// fails open so a Redis outage degrades rate limiting rather than the whole API.
// Disabled in tests to keep the integration suite deterministic.
const makeLimiter = ({ windowMs, max, prefix, skipSuccessfulRequests = false }) => rateLimit({
    windowMs,
    max,
    message: { success: false, message: 'Too many requests, try again later.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    passOnStoreError: true,
    skip: () => config.isTest,
    ...(config.REDIS_URL ? {
        store: new RedisStore({
            // Fast-reject when Redis isn't ready so requests fail open cleanly
            // (via passOnStoreError) instead of hanging or emitting noisy stacks.
            sendCommand: (...args) => (redis.status === 'ready'
                ? redis.call(...args)
                : Promise.reject(new Error('Redis unavailable'))),
            prefix
        })
    } : {})
});

// Global limiter for the whole API surface.
const apiLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 100, prefix: 'rl:api:' });
// Stricter limiter for auth endpoints — only failed attempts count, throttling
// credential brute-force without penalising legitimate logins.
const authLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 20, prefix: 'rl:auth:', skipSuccessfulRequests: true });

app.use('/api/', apiLimiter);

// Request logging middleware - logs every request with status and response time
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

// Async Wrapper to catch database errors clean without try/catch boilerplate
const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// --- VALIDATION SCHEMAS ---
const RegisterSchema = z.object({
    body: z.object({
        name: z.string().min(2, "Name must be at least 2 characters").max(50),
        email: z.email("Invalid email address").transform(val => val.toLowerCase()),
        password: z.string().min(8, "Password must be at least 8 characters")
    })
});

const LoginSchema = z.object({
    body: z.object({
        email: z.email("Invalid email address").transform(val => val.toLowerCase()),
        password: z.string().min(1, "Password is required")
    })
});

const UpdateUserSchema = z.object({
    body: z.object({
        id: z.coerce.number().int("Invalid User ID").positive("Invalid User ID"),
        name: z.string().min(2).max(50).optional(),
        email: z.email().transform(val => val.toLowerCase()).optional(),
        password: z.string().min(8).optional()
    })
});

const NoteSchema = z.object({
    body: z.object({
        title: z.string().min(1, "Title is required").max(200).transform(val => validator.escape(val.trim())),
        content: z.string().min(1, "Content cannot be empty").max(10000, "Content is too long (max 10000 characters)").transform(val => validator.escape(val.trim()))
    })
});

// Whitelist of sortable columns — prevents an arbitrary query string being
// handed to Prisma's orderBy (an unknown column throws at the DB layer).
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

// Numeric route param for note :id — Postgres notes use integer primary keys,
// so reject anything non-numeric with a clean 400 instead of a Prisma crash.
const NoteIdSchema = z.object({
    params: z.object({
        id: z.coerce.number().int("Invalid note ID").positive("Invalid note ID")
    })
});

// Generic Validation Middleware
const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
        const validationError = new AppError("Validation Error", 400);
        validationError.details = result.error.issues.map(err => ({ field: err.path[1], message: err.message }));
        return next(validationError);
    }
    // Assign converted/sanitized values back safely
    // (req.query/req.params are read-only getters in Express 5, so plain assignment is silently ignored)
    if (result.data.body) req.body = result.data.body;
    if (result.data.query) Object.defineProperty(req, 'query', { value: result.data.query, writable: true, configurable: true, enumerable: true });
    if (result.data.params) Object.defineProperty(req, 'params', { value: result.data.params, writable: true, configurable: true, enumerable: true });
    next();
};

// --- USER ROUTES ---

// Route for registering a new user
app.post("/api/v1/users/register", authLimiter, validate(RegisterSchema), catchAsync(async (req, res) => {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new AppError("User already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = await prisma.user.create({
        data: { name, email, password: hashedPassword }
    });

    res.status(201).json({
        success: true,
        data: { name: newUser.name, email: newUser.email },
        message: "User Registered Successfully"
    });
}));

// Route for logging in a user
app.post("/api/v1/users/login", authLimiter, validate(LoginSchema), catchAsync(async (req, res) => {
    const { email, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
        throw new AppError("Invalid email or password", 401); // Secure generic message
    }

    const isPasswordValid = await bcrypt.compare(password, existingUser.password);
    if (!isPasswordValid) {
        throw new AppError("Invalid email or password", 401);
    }

    const payload = { id: existingUser.id, email: existingUser.email, role: 'user' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    res.status(200).json({
        success: true,
        data: { name: existingUser.name, email: existingUser.email, token },
        message: "User Logged In Successfully"
    });
}));

// Route for updating a user
app.put("/api/v1/users", auth.protect, validate(UpdateUserSchema), catchAsync(async (req, res) => {
    const { id, name, email, password } = req.body;
    const currentUserId = req.user.id;

    // Prevent modification of other profiles unless checking ownership properly
    if (id !== currentUserId) {
        throw new AppError("Unauthorized profile modification attempt", 403);
    }

    const updatedFields = {};
    if (name) updatedFields.name = name;
    if (email) updatedFields.email = email;
    if (password) updatedFields.password = await bcrypt.hash(password, SALT_ROUNDS);

    const updatedUser = await prisma.user.update({
        where: { id },
        data: updatedFields,
        select: { id: true, name: true, email: true, createdAt: true }
    });
    res.status(200).json({ success: true, updatedUser, message: "User Updated Successfully" });
}));

// Route for deleting a user
app.delete("/api/v1/users", auth.protect, catchAsync(async (req, res) => {
    const currentUserId = req.user.id;

    // Cascade delete (schema: Note.userId onDelete: Cascade) removes the user's
    // notes atomically in the same database — no orphaned rows possible.
    await prisma.user.delete({ where: { id: currentUserId } });

    await safeInvalidateUserNotesCache(currentUserId);

    res.status(200).json({ success: true, message: "User Account Deleted Successfully" });
}));

// --- NOTE ROUTES ---

// Route for creating a new note
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

// Route for getting all notes with pagination and search
app.get("/api/v1/notes", auth.protect, validate(QueryNoteSchema), catchAsync(async (req, res) => {
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const { sort, order, filter } = req.query;
    const skip = (page - 1) * limit;

    const cacheKey = `notes:user:${userId}:page:${page}:limit:${limit}`;

    // Try to get notes from Redis cache
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

    // Build the query conditions for Prisma
    const where = {
        userId
    };

    if (filter.title) {
        where.title = {
            contains: filter.title,
            mode: 'insensitive'
        };
    }
    if (filter.content) {
        where.content = {
            contains: filter.content,
            mode: 'insensitive'
        };
    }

    // Determine orderBy structure (sort field is whitelisted by QueryNoteSchema)
    const orderBy = { [sort]: order };

    // Fetch notes and total count from database
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

    // Store in cache for 60 seconds (short TTL for paginated list)
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

// Route for getting a note by id
app.get("/api/v1/notes/:id", auth.protect, validate(NoteIdSchema), catchAsync(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const cacheKey = `note:${id}`;

    // Try to get note from Redis cache
    const cached = await safeRedisGet(cacheKey);
    if (cached) {
        const parsedNote = JSON.parse(cached);
        // Enforce ownership validation on cached item
        if (parsedNote.userId !== userId) {
            throw new AppError("Note Not Found", 404);
        }
        return res.status(200).json({ success: true, note: parsedNote, fromCache: true, message: "Note Fetched Successfully" });
    }

    // Cache miss - query DB
    const currentNote = await prisma.note.findUnique({
        where: { id }
    });
    if (!currentNote || currentNote.userId !== userId) {
        throw new AppError("Note Not Found", 404);
    }

    // Store in cache for 5 minutes (300 seconds TTL)
    await safeRedisSet(cacheKey, JSON.stringify(currentNote), 'EX', 300);

    res.status(200).json({ success: true, note: currentNote, fromCache: false, message: "Note Fetched Successfully" });
}));

// Route for updating a note by id
app.put("/api/v1/notes/:id", auth.protect, validate(NoteIdSchema), validate(NoteSchema), catchAsync(async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;
    const userId = req.user.id;
    const cacheKey = `note:${id}`;

    // Verify ownership first
    const currentNote = await prisma.note.findUnique({
        where: { id }
    });
    if (!currentNote) {
        throw new AppError("Note Not Found", 404);
    }
    if (currentNote.userId !== userId) {
        throw new AppError("Forbidden", 403);
    }

    // Perform update
    const updatedNote = await prisma.note.update({
        where: { id },
        data: { title, content }
    });

    // Invalidate cached note and user list cache
    await safeRedisDel(cacheKey);
    await safeInvalidateUserNotesCache(userId);

    res.status(200).json({ success: true, updatedNote, message: "Note Updated Successfully" });
}));

// Route for deleting a note by id
app.delete("/api/v1/notes/:id", auth.protect, validate(NoteIdSchema), catchAsync(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const cacheKey = `note:${id}`;

    // Verify ownership first
    const currentNote = await prisma.note.findUnique({
        where: { id }
    });
    if (!currentNote) {
        throw new AppError("Note Not Found", 404);
    }
    if (currentNote.userId !== userId) {
        throw new AppError("Forbidden", 403);
    }

    // Perform delete
    await prisma.note.delete({
        where: { id }
    });

    // Invalidate cached note and user list cache
    await safeRedisDel(cacheKey);
    await safeInvalidateUserNotesCache(userId);

    res.status(200).json({ success: true, message: "Note Deleted Successfully" });
}));

// --- OPERATIONAL ENDPOINTS ---

// Liveness probe — is the process up? Cheap, never touches dependencies.
app.get("/health", (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Readiness probe — can we serve traffic? Requires PostgreSQL; Redis being down
// is reported but not fatal (the API falls back to querying the database).
app.get("/ready", catchAsync(async (req, res) => {
    const checks = { database: 'down', redis: redis.status === 'ready' ? 'up' : 'down' };
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'up';
    } catch (err) {
        logger.error(`Readiness DB check failed: ${err.message}`);
    }
    const ready = checks.database === 'up';
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready', checks });
}));

// Route for basic health check
app.get("/", (req, res) => {
    res.status(200).send("API Server Running");
});

// Catch-all for unknown routes - forwarded to the central error handler
app.use((req, res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
});

// Global Central Error Interceptor Middleware - every error in the app lands here
// (4-arg signature required by Express to register as an error handler)
app.use((err, req, res, _next) => {
    logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, { stack: err.stack });

    let status = err.status || 500;
    let message = err.message || "Internal Server Error";

    // Translate common Prisma errors into proper client responses
    if (err.code === "P2002") {
        status = 409;
        message = "A record with that value already exists";
    } else if (err.code === "P2025") {
        status = 404;
        message = "Record not found";
    } else if (err.code === "P2003") {
        status = 400;
        message = "Invalid reference to a related record";
    }

    const dev = !config.isProd;
    res.status(status).json({
        success: false,
        message,
        ...(err.details && { errors: err.details }),
        ...(dev ? { stack: err.stack } : {})
    });
});

// Close pooled connections so a shutdown or test teardown doesn't leak sockets.
const shutdownDependencies = async () => {
    try { await prisma.$disconnect(); } catch (err) { logger.error(`Prisma disconnect error: ${err.message}`); }
    try { await pool.end(); } catch (err) { logger.error(`Pool end error: ${err.message}`); }
    try { redis.disconnect(); } catch (err) { logger.error(`Redis disconnect error: ${err.message}`); }
};
app.shutdownDependencies = shutdownDependencies;

// Start the server (PostgreSQL is reached lazily through the shared Prisma pool)
if (!config.isTest) {
  const port = config.PORT;
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Server running on port ${port}`);

    // Asynchronously apply pending migrations to PostgreSQL in the background
    if (config.isProd) {
      const { exec } = require('child_process');
      exec('npx prisma migrate deploy', (err) => {
        if (err) {
          logger.error(`Prisma migrate deploy error: ${err.message}`);
        } else {
          logger.info('Prisma PostgreSQL migrations applied successfully');
        }
      });
    }
  });

  // Log then exit on fatal process-level errors so the orchestrator restarts us.
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${reason instanceof Error ? reason.message : reason}`, { stack: reason?.stack });
    process.exit(1);
  });

  // Graceful shutdown — drain in-flight requests, then close connections.
  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await shutdownDependencies();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
