require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { pool } = require('./config/db');
const { getDatabaseUrl, validateEnvironment } = require('./config/env');
const { databaseReady } = require('./middleware/dbReady');
const { maybeRunHousekeeping } = require('./middleware/housekeepingTick');
const { requireSameOrigin } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

app.use((req, res, next) => {
  res.locals.requestId = req.headers['x-vercel-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId);
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.use(cookieParser());
app.use(requireSameOrigin);
app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders:'draft-7', legacyHeaders:false }));

app.get('/health', async (_req, res) => {
  const dbConfigured = Boolean(getDatabaseUrl());
  let database = 'not-configured';
  try {
    if (dbConfigured) {
      const { rows } = await pool.query('SELECT now() AS database_time');
      database = 'ok';
      return res.json({ status:'ok', database, databaseTime:rows[0].database_time, node:process.version });
    }
  } catch (e) {
    database = 'unavailable';
  }
  res.status(503).json({ status:'degraded', database, node:process.version });
});

// Cron is intentionally outside /api/v1 but still requires a ready database.
app.use('/api/cron', databaseReady, require('./routes/cron.routes'));

// Every application API call verifies/configures database readiness first.
app.use('/api/v1', databaseReady);
app.use('/api/v1', maybeRunHousekeeping);
app.use('/api/v1', require('./routes/system.routes'));
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1', require('./routes/catalog.routes'));
app.use('/api/v1/me', require('./routes/member.routes'));
app.use('/api/v1', require('./routes/loan.routes'));
app.use('/api/v1', require('./routes/reservation.routes'));
app.use('/api/v1/staff/collective', require('./routes/collective.routes'));
app.use('/api/v1', require('./routes/room.routes'));
app.use('/api/v1', require('./routes/fine.routes'));
app.use('/api/v1', require('./routes/incident.routes'));
app.use('/api/v1', require('./routes/suggestion.routes'));
app.use('/api/v1', require('./routes/notification.routes'));
app.use('/api/v1', require('./routes/admin.routes'));
app.use('/api/v1', require('./routes/clearance.routes'));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, etag:true }));
app.get(/^\/(?!api\/|health$).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use(notFound);
app.use(errorHandler);

// Fail early locally, but do not crash the build process when Vercel has not injected runtime env yet.
if (process.env.NODE_ENV !== 'production') {
  try { validateEnvironment(); } catch (e) { console.warn('[config]', e.message); }
}

module.exports = app;
