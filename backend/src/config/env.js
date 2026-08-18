// Centralised, validated access to environment variables.
require('dotenv').config();

const required = ['MONGO_URI', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    // In development we warn instead of crashing so `npm run dev` still
    // boots far enough to show a helpful error from the DB connection step.
    // eslint-disable-next-line no-console
    console.warn(`[config] Missing environment variable: ${key}. Copy .env.example to .env and fill it in.`);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ispm_savikro',
  jwtSecret: process.env.JWT_SECRET || 'insecure_dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,
  lockTimeMinutes: parseInt(process.env.LOCK_TIME_MINUTES, 10) || 15,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
