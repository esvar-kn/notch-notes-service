const winston = require('winston');
const config = require('./config');

winston.addColors(winston.config.npm.colors);
const { combine, timestamp, errors, json, printf } = winston.format;

const COLORS = {
    error: '\x1b[31m',
    warn:  '\x1b[33m',
    info:  '\x1b[32m',
    http:  '\x1b[36m',
    reset: '\x1b[0m'
};

const fileFormat = () => combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
);

const consoleFormat = () => combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp }) => {
        const color = COLORS[level] || '';
        return `[Auth Service] ${color}${timestamp} ${level}: ${message}${COLORS.reset}`;
    })
);

const transports = [
    new winston.transports.Console({
        format: config.isProd ? fileFormat() : consoleFormat(),
        stderrLevels: ['error']
    })
];

const logger = winston.createLogger({
    levels: winston.config.npm.levels,
    level: config.isProd ? 'info' : 'http',
    transports,
    exitOnError: false
});

module.exports = logger;
