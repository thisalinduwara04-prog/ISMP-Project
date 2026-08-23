/* eslint-disable no-console */
const env = require('./config/env');
const { createApp } = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const redactUri = require('./utils/redactUri');

const start = async () => {
  await connectDatabase();
  console.log(`[db] Connected to ${redactUri(env.MONGO_URI)}`);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[api] Listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
  });

  // Drain in-flight requests before dropping the database connection, so a
  // deploy does not sever a request mid-write.
  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down.`);
    server.close(async () => {
      await disconnectDatabase();
      console.log('[api] Shutdown complete.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[api] Forced shutdown after 10s timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  console.error('[api] Failed to start:', err);
  process.exit(1);
});
