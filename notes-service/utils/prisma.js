const config = require('./config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const isLocalDb = config.DATABASE_URL.includes('localhost') || 
                  config.DATABASE_URL.includes('127.0.0.1') || 
                  config.DATABASE_URL.includes('postgres') || 
                  config.DATABASE_URL.includes('notch-db') || 
                  config.DATABASE_URL.includes('sslmode=disable');

const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.PG_POOL_MAX,
    ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } })
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = { prisma, pool };
