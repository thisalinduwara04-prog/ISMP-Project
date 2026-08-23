const mongoose = require('mongoose');
const env = require('./env');

// Reject writes that do not match the schema rather than silently dropping
// unknown keys, and fail fast on a bad connection string instead of buffering
// queries for 30 seconds.
mongoose.set('strictQuery', true);

const connectDatabase = async (uri = env.MONGO_URI) => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
};

const disconnectDatabase = async () => {
  await mongoose.connection.close();
};

module.exports = { connectDatabase, disconnectDatabase };
