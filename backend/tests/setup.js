const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// An in-memory MongoDB per test run, so the suite needs no external database
// and cannot touch real data.
//
// A REPLICA SET rather than a standalone, because the publish workflow uses a
// transaction and transactions need one. Testing against a standalone would
// silently exercise the fallback path instead of the code that actually runs
// in production - the suite would pass while never touching the transaction.

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri(), { dbName: 'ispm_test' });

  // Indexes are part of what is under test - the partial unique index is what
  // enforces one published version per policy - so they must exist before any
  // test runs. Mongoose builds them lazily otherwise.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

// Each test starts from an empty database, so one test's data can never change
// another's result or its order dependence.
afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});
