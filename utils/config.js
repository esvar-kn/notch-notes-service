// Central, validated configuration. This module MUST be required before any
// other module that reads process.env (e.g. utils/prisma, utils/logger), so it
// loads the correct .env file and fails fast on invalid/missing config.
const path = require('path');
const { z } = require('zod');

// Load the environment-appropriate dotenv file. In CI/production the values are
// usually injected directly as real env vars; dotenv never overrides those, and
// a missing file is a harmless no-op.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

const isProd = process.env.NODE_ENV === 'production';

const schema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    // Postgres is the single source of truth — always required.
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // Redis is an optional cache / rate-limit store; the app degrades gracefully.
    REDIS_URL: z.string().optional(),

    // Enforce a strong signing secret in production; stay lenient in dev/test.
    JWT_SECRET: isProd
        ? z.string().min(32, 'JWT_SECRET must be at least 32 characters in production')
        : z.string().min(1, 'JWT_SECRET is required'),
    JWT_EXPIRY: z.string().default('1h'),

    // bcrypt cost factor (4–15). Lower in tests for speed, ~12 in production.
    SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    // Comma-separated list of allowed CORS origins (optional).
    ALLOWED_ORIGIN: z.string().optional(),

    // Number of proxy hops to trust for client IP (rate limiting). Railway = 1.
    TRUST_PROXY: z.coerce.number().int().min(0).default(isProd ? 1 : 0),

    // Cap Postgres connections per instance so scaling doesn't exhaust the server.
    PG_POOL_MAX: z.coerce.number().int().positive().default(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    // The logger depends on this module, so it may not exist yet — use console.
    console.error('❌ Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
}

const config = parsed.data;
config.isProd = config.NODE_ENV === 'production';
config.isTest = config.NODE_ENV === 'test';

module.exports = config;
