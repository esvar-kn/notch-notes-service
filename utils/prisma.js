// Single shared PostgreSQL connection: one pg Pool + one PrismaClient for the
// whole process. Imported by index.js (routes) and middlewares/auth.js so we
// never open duplicate pools or clients.
const config = require('./config'); // ensures env is loaded + validated first
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// Managed Postgres providers (Railway, Supabase, RDS, …) require TLS; a local
// server does not. Detect localhost and skip SSL there.
const isLocalDb = config.DATABASE_URL.includes('localhost') || 
                  config.DATABASE_URL.includes('127.0.0.1') || 
                  config.DATABASE_URL.includes('postgres') || 
                  config.DATABASE_URL.includes('notch-db') || 
                  config.DATABASE_URL.includes('sslmode=disable');

const pool = new Pool({
    connectionString: config.DATABASE_URL,
    // Cap connections per instance so horizontal scaling doesn't exhaust Postgres.
    max: config.PG_POOL_MAX,
    ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } })
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = { prisma, pool };
