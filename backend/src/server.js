const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');

async function start() {
  await connectDB();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] ISPM API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

start();

process.on('unhandledRejection', (err) => {
  // eslint-disable-next-line no-console
  console.error('[server] Unhandled rejection:', err);
});
