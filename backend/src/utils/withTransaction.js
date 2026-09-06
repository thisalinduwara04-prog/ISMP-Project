const mongoose = require('mongoose');

const env = require('../config/env');

// ---------------------------------------------------------------------------
// Run a multi-document write atomically where the deployment allows it.
// ---------------------------------------------------------------------------
//
// Publishing a policy version is several writes that mean nothing apart:
// demote the old version, promote the new one, repoint the policy, supersede
// the old assignments, fan out the new ones. Half of that is a corrupt state.
//
// MongoDB transactions need a replica set or a sharded cluster. Atlas provides
// one; a plain `mongod` on a teammate's laptop does not, and there it throws
// IllegalOperation (code 20) on the FIRST write in the transaction - before
// anything has been written. That is what makes the fallback safe: the work
// simply has not started yet, so re-running it without a session cannot
// double-apply.
//
// `work` therefore receives a session that may be null, and must pass it to
// every query it makes. Callers must also do their reads INSIDE `work`:
// `session.withTransaction` may re-run the callback on a transient conflict,
// and a Mongoose document mutated outside would have already been marked clean
// by the first attempt, so the retry would save nothing.

const isTransactionUnsupported = (error) =>
  !!error &&
  (error.code === 20 ||
    error.codeName === 'IllegalOperation' ||
    /Transaction numbers are only allowed on|Transactions are not supported/i.test(
      error.message || ''
    ));

let warned = false;

const warnOnce = () => {
  if (warned || env.isTest) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[withTransaction] This MongoDB deployment does not support transactions, so ' +
      'multi-document writes run sequentially. A crash mid-publish can leave a ' +
      'recoverable partial state: the partial unique index still guarantees at most ' +
      'one PUBLISHED version, so re-running the publish is safe. Use a replica set ' +
      'or Atlas for full atomicity.'
  );
};

const withTransaction = async (work) => {
  let session = null;

  try {
    session = await mongoose.startSession();
  } catch {
    // No session support at all - fall straight through to the plain path.
    return work(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (!isTransactionUnsupported(error)) throw error;
    warnOnce();
  } finally {
    await session.endSession();
  }

  return work(null);
};

module.exports = { withTransaction, isTransactionUnsupported };
