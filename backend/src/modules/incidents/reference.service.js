const Incident = require('../../models/Incident');

// UC-22 postcondition: every incident gets a human-readable reference like
// "INC-2026-0001" that an employee can quote over the phone.
//
// The sequence is derived by counting this year's incidents rather than kept in
// a counters collection. That is technically racy - two simultaneous
// submissions can compute the same number - but the unique index on `reference`
// makes the loser fail with E11000 rather than duplicate, and the retry below
// recounts and takes the next value. At roughly 100 incidents a year (spec
// section 7.2) a collision needs two submissions in the same few milliseconds,
// and a counters collection would be a whole extra piece of machinery to avoid
// a retry that costs one query.

const MAX_ATTEMPTS = 5;

const prefixFor = (date) => `INC-${date.getFullYear()}-`;

const nextReference = async (date = new Date()) => {
  const prefix = prefixFor(date);
  // Anchored prefix match, so the count is per-year and the numbering restarts
  // each January.
  const used = await Incident.countDocuments({ reference: new RegExp(`^${prefix}`) });
  return `${prefix}${String(used + 1).padStart(4, '0')}`;
};

// Runs `save(reference)` with a freshly-computed reference, retrying on a
// duplicate-key collision. Returns whatever `save` returns.
const withReference = async (save) => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // Recomputed inside the loop: after a collision the count has moved on.
      return await save(await nextReference());
    } catch (error) {
      const isDuplicateReference = error && error.code === 11000 && error.keyPattern?.reference;
      if (!isDuplicateReference || attempt === MAX_ATTEMPTS) throw error;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error('Could not allocate an incident reference.');
};

module.exports = { nextReference, withReference };
