require('dotenv').config();
const { z } = require('zod');

// Environment is validated once, at boot, with Zod. Two behaviours matter:
//
//  - In production a missing or malformed value THROWS. A server that starts
//    with a default JWT secret is worse than one that refuses to start.
//  - In development and test, safe defaults fill the gaps so `npm test` works
//    on a fresh clone with no .env file.

const isProduction = process.env.NODE_ENV === 'production';

const csv = z
  .string()
  .transform((value) => value.split(',').map((s) => s.trim()).filter(Boolean));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  MONGO_URI: isProduction
    ? z.string().min(1)
    : z.string().min(1).default('mongodb://127.0.0.1:27017/ispm_savikro'),

  JWT_ACCESS_SECRET: isProduction
    ? z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
    : z.string().min(1).default('dev_only_access_secret_do_not_use_in_production'),
  JWT_REFRESH_SECRET: isProduction
    ? z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters')
    : z.string().min(1).default('dev_only_refresh_secret_do_not_use_in_production'),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCK_TIME_MINUTES: z.coerce.number().int().positive().default(15),

  // Deliberately LOOSER than MAX_LOGIN_ATTEMPTS. The two controls stack, and
  // the per-account lockout is the precise one: it must be allowed to fire and
  // report 423 before the coarse limiter starts returning 429. Setting them
  // equal makes the lockout response unreachable (US-004).
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // Cost 12 is mandated by NFR-SEC-02. Tests drop it to 4 so the suite is not
  // dominated by deliberately-slow hashing; nothing else may lower it.
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  CLIENT_ORIGINS: csv.default('http://localhost:5173'),

  // Optional development/sandbox SMTP. Reminder delivery remains non-fatal
  // when these are absent; the in-app notification is still retained.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().default('security@savikro.local'),
  REMINDER_CRON: z.string().default('0 1 * * *'),
  REMINDER_TIMEZONE: z.string().default('Asia/Colombo'),
});

// An unset variable and one present but empty (`MONGO_URI=` in a .env file)
// mean the same thing to a human, but Zod only applies a default to the
// former. Normalising here stops a blank line producing a baffling
// "String must contain at least 1 character(s)".
const source = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== '')
);

const parsed = schema.safeParse(source);

if (!parsed.success) {
  // Misconfiguration is an operator error, not a bug, so it gets a readable
  // message and a clean exit rather than a stack trace pointing into this file.
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  // eslint-disable-next-line no-console
  console.error(
    `\nInvalid environment configuration:\n\n${issues}\n\n` +
      'Check backend/.env against backend/.env.example.\n'
  );
  process.exit(1);
}

const env = Object.freeze({
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  isDevelopment: parsed.data.NODE_ENV === 'development',
});

// Refusing to boot with identical secrets: if an access token also verifies as
// a refresh token, a 15-minute credential silently becomes a 7-day one.
if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
}

module.exports = env;
