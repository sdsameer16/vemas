require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Security headers
app.use(helmet());

// Middleware
const normalizeOrigin = (value) => String(value || '').trim().replace(/\/$/, '');

const splitOrigins = (value) => String(value || '')
    .split(',')
    .map(part => normalizeOrigin(part))
    .filter(Boolean);

const allowedOrigins = Array.from(new Set([
    ...splitOrigins(process.env.CORS_ORIGIN),
    ...splitOrigins(process.env.CLIENT_URL),
    'https://vema-society.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
]));

const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

app.use(cors({
    origin: (origin, callback) => {
        // allow non-browser clients (curl/postman) with no origin
        if (!origin) return callback(null, true);
        const normalizedOrigin = normalizeOrigin(origin);
        if (allowedOrigins.includes(normalizedOrigin)) return callback(null, true);
        if (localhostPattern.test(normalizedOrigin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    optionsSuccessStatus: 204,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected to:', mongoose.connection.name))
    .catch(err => {
        console.error('MongoDB connection FAILED:', err.message);
        process.exit(1);
    });

// Routes (to be imported)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/employee', require('./routes/employee'));
app.use('/api/loans', require('./routes/loans'));

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        env: {
            MONGODB_URI: process.env.MONGODB_URI ? 'set' : 'MISSING',
            JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'MISSING',
            CLIENT_URL: process.env.CLIENT_URL || 'not set'
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
