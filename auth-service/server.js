const config = require('./utils/config');
const express = require('express');
const compression = require('compression');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const z = require('zod');
const auth = require('./middlewares/auth');
const logger = require('./utils/logger');
const AppError = require('./utils/appError');
const { prisma } = require('./utils/prisma');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const SALT_ROUNDS = config.SALT_ROUNDS;
const JWT_SECRET = config.JWT_SECRET;
const JWT_EXPIRY = config.JWT_EXPIRY;

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

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many auth requests, try again later.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: () => config.isTest
});

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
const RegisterSchema = z.object({
    body: z.object({
        name: z.string().min(2, "Name must be at least 2 characters").max(50),
        email: z.string().email("Invalid email address").transform(val => val.toLowerCase()),
        password: z.string().min(8, "Password must be at least 8 characters")
    })
});

const LoginSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email address").transform(val => val.toLowerCase()),
        password: z.string().min(1, "Password is required")
    })
});

const UpdateUserSchema = z.object({
    body: z.object({
        id: z.coerce.number().int("Invalid User ID").positive("Invalid User ID"),
        name: z.string().min(2).max(50).optional(),
        email: z.string().email().transform(val => val.toLowerCase()).optional(),
        password: z.string().min(8).optional()
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
    next();
};

// Auth / User Handlers
const handleRegister = catchAsync(async (req, res) => {
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
});

const handleLogin = catchAsync(async (req, res) => {
    const { email, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
        throw new AppError("Invalid email or password", 401);
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
});

const handleUpdateUser = catchAsync(async (req, res) => {
    const { id, name, email, password } = req.body;
    const currentUserId = req.user.id;

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
});

const handleDeleteUser = catchAsync(async (req, res) => {
    const currentUserId = req.user.id;
    await prisma.user.delete({ where: { id: currentUserId } });
    res.status(200).json({ success: true, message: "User Account Deleted Successfully" });
});

app.post("/api/v1/auth/register", authLimiter, validate(RegisterSchema), handleRegister);
app.post("/api/v1/users/register", authLimiter, validate(RegisterSchema), handleRegister);

app.post("/api/v1/auth/login", authLimiter, validate(LoginSchema), handleLogin);
app.post("/api/v1/users/login", authLimiter, validate(LoginSchema), handleLogin);

app.put("/api/v1/auth/user", auth.protect, validate(UpdateUserSchema), handleUpdateUser);
app.put("/api/v1/users", auth.protect, validate(UpdateUserSchema), handleUpdateUser);

app.delete("/api/v1/auth/user", auth.protect, handleDeleteUser);
app.delete("/api/v1/users", auth.protect, handleDeleteUser);

app.get("/health", (req, res) => {
    res.status(200).json({ status: 'ok', service: 'auth-service', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get("/ready", catchAsync(async (req, res) => {
    let dbStatus = 'down';
    try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'up';
    } catch (err) {
        logger.error(`Auth service DB check failed: ${err.message}`);
    }
    const ready = dbStatus === 'up';
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready', database: dbStatus });
}));

app.use((req, res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
});

app.use((err, req, res, _next) => {
    logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, { stack: err.stack });
    let status = err.status || 500;
    let message = err.message || "Internal Server Error";

    if (err.code === "P2002") {
        status = 409;
        message = "A record with that value already exists";
    } else if (err.code === "P2025") {
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

if (!config.isTest) {
    const port = process.env.AUTH_PORT || config.PORT || 4001;
    const server = app.listen(port, '0.0.0.0', () => {
        logger.info(`Auth Service running on port ${port}`);
    });
    module.exports = server;
} else {
    module.exports = app;
}
