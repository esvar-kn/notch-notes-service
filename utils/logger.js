const winston = require('winston');
const config = require('./config');

// Register npm level colors (error, warn, info, http, verbose, debug, silly)
winston.addColors(winston.config.npm.colors);

const { combine, timestamp, errors, json, printf } = winston.format;

// ANSI color codes — avoids colorize() which silently drops output in non-TTY pipes (e.g. nodemon)
const COLORS = {
    error: '\x1b[31m',  // red
    warn:  '\x1b[33m',  // yellow
    info:  '\x1b[32m',  // green
    http:  '\x1b[36m',  // cyan
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
        return `${color}${timestamp} ${level}: ${message}${COLORS.reset}`;
    })
);

// In production (containers/Railway) log structured JSON to stdout/stderr only,
// and let the platform ship the logs — writing to local files inside an
// ephemeral, horizontally-scaled container fragments and loses them. In dev we
// keep human-readable console output plus local files for convenience.
const transports = [
    new winston.transports.Console({
        format: config.isProd ? fileFormat() : consoleFormat(),
        stderrLevels: ['error'] // Route error logs to stderr
    })
];

if (!config.isProd) {
    transports.push(
        new winston.transports.File({ filename: 'logs/error.log', level: 'error', format: fileFormat() }),
        new winston.transports.File({ filename: 'logs/combined.log', format: fileFormat() })
    );
}

const logger = winston.createLogger({
    levels: winston.config.npm.levels,
    level: config.isProd ? 'info' : 'http',
    transports,
    // Process-level uncaught exceptions/rejections are handled explicitly in
    // index.js (log then exit) so the orchestrator can restart the instance.
    exitOnError: false
});

module.exports = logger;
