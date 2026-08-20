const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.GATEWAY_PORT || process.env.PORT || 4000;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
const NOTES_SERVICE_URL = process.env.NOTES_SERVICE_URL || 'http://localhost:4002';

app.use(helmet());
app.use(cors());

// Request logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[Gateway] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// Gateway health route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
});

// Proxy rule for Auth Service (port 4001)
const authProxy = createProxyMiddleware({
    pathFilter: ['/api/v1/auth', '/api/v1/users'],
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
});

// Proxy rule for Notes Service HTTP endpoints
const notesProxy = createProxyMiddleware({
    pathFilter: '/api/v1/notes',
    target: NOTES_SERVICE_URL,
    changeOrigin: true,
});

// Proxy rule for WebSockets & Socket.io
const socketProxy = createProxyMiddleware({
    pathFilter: '/socket.io',
    target: NOTES_SERVICE_URL,
    ws: true,
    changeOrigin: true,
});

app.use(authProxy);
app.use(notesProxy);
app.use(socketProxy);

// Fallback 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Gateway: Route ${req.method} ${req.originalUrl} not found` });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`   Routing /api/v1/auth & /api/v1/users -> ${AUTH_SERVICE_URL}`);
    console.log(`   Routing /api/v1/notes & /socket.io  -> ${NOTES_SERVICE_URL}`);
});

server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/socket.io')) {
        socketProxy.upgrade(req, socket, head);
    }
});

module.exports = server;
