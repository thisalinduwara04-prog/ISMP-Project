const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const env = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const policyRoutes = require('./routes/policyRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const complianceRoutes = require('./routes/complianceRoutes');

const app = express();

// Secure HTTP headers (helmet) - part of the non-functional security
// requirement alongside HTTPS/TLS termination, which is handled by the
// reverse proxy / hosting platform in production.
app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/compliance', complianceRoutes);

// Uploaded incident attachments are served statically so admins can open
// them from the incident detail view. Not publicly linked anywhere; a real
// deployment behind auth-checked download URLs would harden this further.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
