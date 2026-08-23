/* eslint-disable no-console */
// Connection preflight. Atlas failures surface from the driver as long,
// near-identical timeout messages regardless of cause, so this translates the
// common ones into the actual fix.
//
//   npm run check:db

const mongoose = require('mongoose');
const env = require('../src/config/env');
const redact = require('../src/utils/redactUri');

const describeTarget = (uri) => {
  if (uri.startsWith('mongodb+srv://')) return 'MongoDB Atlas (SRV)';
  if (/127\.0\.0\.1|localhost/.test(uri)) return 'a LOCAL MongoDB';
  return 'a remote MongoDB';
};

// Atlas omits the database name from the string it gives you; without one the
// driver silently uses "test", and the seed appears to do nothing.
const databaseName = (uri) => {
  const match = uri.match(/\.net\/([^?]+)/) || uri.match(/:\d+\/([^?]+)/);
  return match ? match[1] : null;
};

const diagnose = (error) => {
  const message = error.message || '';

  if (/ENOTFOUND|querySrv/i.test(message)) {
    return [
      'The cluster hostname could not be resolved.',
      '  - Check the host part of MONGO_URI for a typo.',
      '  - Confirm the cluster still exists and is not paused in Atlas.',
    ];
  }
  if (/Authentication failed|bad auth/i.test(message)) {
    return [
      'The cluster was reached, but the username or password was rejected.',
      '  - Atlas > Database Access: confirm the user exists and has readWrite.',
      '  - If the password contains @ : / ? # [ ] or %, percent-encode it',
      '    (@ -> %40, # -> %23). An unencoded @ splits the URI in the wrong place.',
      '  - The copied string contains the literal <password> until you replace it.',
    ];
  }
  if (/IP.*whitelist|not allowed to connect|ETIMEDOUT|ServerSelectionError|Server selection timed out/i.test(message)) {
    return [
      'The cluster did not accept the connection in time.',
      '  - Atlas > Network Access: add your current IP address.',
      '    This is the usual cause, and it is silent - Atlas simply does not answer.',
      '  - On a campus or corporate network, outbound 27017 may be blocked;',
      '    try a phone hotspot to confirm.',
    ];
  }
  return ['Unrecognised failure. Full driver message above.'];
};

const PLACEHOLDER = 'PASTE_YOUR_ATLAS_CONNECTION_STRING_HERE';

(async () => {
  // Caught explicitly rather than left to fail as a malformed URI, and kept as
  // a placeholder rather than an empty value: an empty MONGO_URI would fall
  // back to the localhost development default and connect to the wrong
  // database without saying so.
  if (!env.MONGO_URI || env.MONGO_URI === PLACEHOLDER) {
    console.error('\n  MONGO_URI has not been filled in yet.');
    console.error('  Open backend/.env and replace the placeholder on the MONGO_URI line');
    console.error('  with your Atlas connection string, then re-run: npm run check:db\n');
    process.exit(1);
  }

  console.log(`\n  Target : ${describeTarget(env.MONGO_URI)}`);
  console.log(`  URI    : ${redact(env.MONGO_URI)}`);

  const db = databaseName(env.MONGO_URI);
  if (!db) {
    console.warn('\n  WARNING: no database name in the URI, so Mongo will use "test".');
    console.warn('  Add /ispm_savikro before the "?" in MONGO_URI.');
  } else {
    console.log(`  Database: ${db}`);
  }

  const startedAt = Date.now();
  try {
    await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

    const admin = mongoose.connection.db.admin();
    const { version } = await admin.serverInfo();
    const collections = await mongoose.connection.db.listCollections().toArray();

    console.log(`\n  CONNECTED in ${Date.now() - startedAt} ms`);
    console.log(`  MongoDB version : ${version}`);
    console.log(`  Collections     : ${collections.length ? collections.map((c) => c.name).join(', ') : '(none yet - run npm run seed)'}`);

    // A read-only Atlas user connects fine and then fails at seed time, which
    // is a confusing place to discover it.
    const probe = mongoose.connection.db.collection('__write_probe');
    await probe.insertOne({ at: new Date() });
    await probe.drop();
    console.log('  Write access    : OK');

    console.log('\n  Ready. Next: npm run seed\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(`\n  FAILED after ${Date.now() - startedAt} ms`);
    console.error(`  ${error.message}\n`);
    diagnose(error).forEach((line) => console.error(`  ${line}`));
    console.error('');
    process.exit(1);
  }
})();
