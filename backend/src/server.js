/* eslint-disable no-console */
const env = require('./config/env');
const { createApp } = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const redactUri = require('./utils/redactUri');
const { startReminderScheduler, stopReminderScheduler } = require('./modules/compliance/reminder.scheduler');

const start = async () => {
  await connectDatabase();
  console.log(`[db] Connected to ${redactUri(env.MONGO_URI)}`);

  const app = createApp();
  startReminderScheduler();
  const server = app.listen(env.PORT, () => {
    console.log(`[api] Listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
  });

  // Without this, a port clash surfaces as an unhandled 'error' event: a raw
  // EADDRINUSE stack trace, and nodemon reporting only "app crashed". The
  // usual cause is a previous run that outlived its terminal, so the message
  // says how to clear it rather than just naming the errno.
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `\n[api] Port ${env.PORT} is already in use - another copy of this server is still running.\n` +
          '      Windows:  netstat -ano | findstr :' + env.PORT + '   then  taskkill /PID <pid> /F\n' +
          '      macOS/Linux:  lsof -ti:' + env.PORT + ' | xargs kill\n' +
          `      Or set PORT to something else in backend/.env.\n`
      );
      process.exit(1);
    }
    console.error('[api] Server error:', error);
    process.exit(1);
  });

  // Drain in-flight requests before dropping the database connection, so a
  // deploy does not sever a request mid-write.
  // `code` is what distinguishes an orderly stop from a crash. Exiting 0 after
  // an unhandled rejection would have nodemon report a clean exit, which is
  // exactly the wrong signal.
  const shutdown = async (signal, code = 0) => {
    console.log(`\n[api] ${signal} received, shutting down.`);
    server.close(async () => {
      stopReminderScheduler();
      await disconnectDatabase();
      console.log('[api] Shutdown complete.');
      process.exit(code);
    });

    setTimeout(() => {
      console.error('[api] Forced shutdown after 10s timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // The API has several deliberately fire-and-forget paths (reminder mail,
  // notification writes). On Node 18+ an unhandled rejection in one of them
  // terminates the process with no indication of which one, which is the other
  // way this server "just crashes". Logging the reason first is the whole
  // point: the process still exits, but it says why on the way out.
  process.on('unhandledRejection', (reason) => {
    console.error('[api] Unhandled promise rejection:', reason);
    shutdown('unhandledRejection', 1);
  });

  process.on('uncaughtException', (error) => {
    console.error('[api] Uncaught exception:', error);
    shutdown('uncaughtException', 1);
  });
};

start().catch((err) => {
  console.error('[api] Failed to start:', err);
  process.exit(1);
});
