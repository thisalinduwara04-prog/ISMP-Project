// A MongoDB connection string carries the database password in plain sight,
// and startup banners get pasted into chats, tickets and screenshots. Every
// place that logs the URI routes through here first.
//
// Also collapses a multi-host replica-set list, which is otherwise an
// unreadable wall of near-identical hostnames.
const redactUri = (uri) => {
  if (typeof uri !== 'string' || uri.length === 0) return '(not set)';

  return uri
    .replace(/\/\/([^:@]+):([^@]+)@/, '//$1:****@')
    .replace(/@([^/,]+),[^/]*\//, '@$1,...(replica set)/');
};

module.exports = redactUri;
