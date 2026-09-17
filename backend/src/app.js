const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const env = require('./config/env');
const { applySecurity, sanitize } = require('./middleware/security');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { OK } = require('./constants/http');

const API_PREFIX = '/api/v1';

// The app is built and exported WITHOUT listening, so Supertest can mount it
// directly and the tests never need a real port.
const createApp = () => {
  const app = express();

  applySecurity(app);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitize);

  if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  app.get(`${API_PREFIX}/health`, (req, res) =>
    res.status(OK).json({
      success: true,
      data: { status: 'ok', environment: env.NODE_ENV, timestamp: new Date().toISOString() },
      requestId: req.id,
    })
  );

  // Feature routers mount here as each slice lands.
  /* eslint-disable global-require */
  app.use(`${API_PREFIX}/auth`, require('./modules/auth/auth.routes'));
  // Two routers share the `/users` prefix. M1 owns the account itself; M4 owns
  // that account's compliance record. Express chains them, and M1's `/:id`
  // matches a single segment only, so `/users/:id/compliance` falls through to
  // M4's router untouched. M1 is mounted first so `authenticate` and
  // `requirePasswordChanged` run once, ahead of both.
  app.use(`${API_PREFIX}/users`, require('./modules/user/user.routes'));
  app.use(`${API_PREFIX}/users`, require('./modules/compliance/user-compliance.routes'));
  app.use(`${API_PREFIX}/audit-logs`, require('./modules/audit/audit.routes'));
  app.use(`${API_PREFIX}/compliance`, require('./modules/compliance/compliance.routes'));
  app.use(`${API_PREFIX}/notifications`, require('./modules/notifications/notification.routes'));
  app.use(`${API_PREFIX}/policies`, require('./modules/policy/policy.routes'));
  app.use(`${API_PREFIX}/training`, require('./modules/training/training.routes'));
  app.use(`${API_PREFIX}/incidents`, require('./modules/incidents/incident.routes'));
  /* eslint-enable global-require */

  // Guarded probe routes exist only under NODE_ENV=test. They give the RBAC
  // negative-path suite stable targets to fire a low-privilege token at before
  // the real M2-M5 routes exist, and they are never reachable in a deployment.
  if (env.isTest) {
    // eslint-disable-next-line global-require
    app.use(`${API_PREFIX}/_rbac-probe`, require('./modules/_probe/probe.routes'));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = { createApp, API_PREFIX };
