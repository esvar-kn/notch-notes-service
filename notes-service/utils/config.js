const path = require('path');
const { z } = require('zod');

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
require('dotenv').config({ path: path.resolve(__dirname, '..', envFile) });

const isProd = process.env.NODE_ENV === 'production';

const schema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4002),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().optional(),
    JWT_SECRET: isProd
        ? z.string().min(32, 'JWT_SECRET must be at least 32 characters in production')
        : z.string().min(1, 'JWT_SECRET is required'),
    ALLOWED_ORIGIN: z.string().optional(),
    TRUST_PROXY: z.coerce.number().int().min(0).default(isProd ? 1 : 0),
    PG_POOL_MAX: z.coerce.number().int().positive().default(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ [Notes Service] Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
}

const config = parsed.data;
config.isProd = config.NODE_ENV === 'production';
config.isTest = config.NODE_ENV === 'test';

module.exports = config;
