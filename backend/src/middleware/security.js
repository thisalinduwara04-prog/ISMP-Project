const crypto = require('node:crypto');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const env = require('../config/env');

// Correlates a client-visible `requestId` in the error envelope with the
// server-side log line for the same request.
const requestId = (req, res, next) => {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.set('x-request-id', req.id);
  next();
};

// An explicit allow-list, not a reflected origin. `credentials: true` is
// required because both auth cookies are sent cross-origin from the SPA, and
// the CORS spec forbids pairing credentials with a wildcard origin.
const corsMiddleware = cors({
  origin(origin, callback) {
    // Same-origin, curl and server-to-server requests send no Origin header.
    if (!origin) return callback(null, true);
    if (env.CLIENT_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
});

// Strips keys beginning with `$` or containing `.` from the body, query and
// params, so a payload like { "employeeId": { "$ne": null } } cannot turn a
// findOne into a "return the first user" query.
const sanitize = mongoSanitize({ replaceWith: '_' });

const applySecurity = (app) => {
  app.disable('x-powered-by');

  // Rate limiters key on req.ip, which behind a proxy is the proxy's address
  // unless Express is told to trust the forwarding header.
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    helmet({
      // The API serves JSON only; a CSP here would govern nothing. HSTS is
      // terminated at the hosting layer.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    })
  );
  app.use(corsMiddleware);
};

module.exports = { applySecurity, requestId, corsMiddleware, sanitize };
