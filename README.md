# Savikro — Security Policy Awareness & Compliance Management Platform

Group 14 · IE3072 Information Security Policy Management · SLIIT

Implementation of the platform described in `Spec_Group14_SecurityPolicyPlatform.md`.

**Current state:** M1 (Authentication & RBAC) is complete. The
`compliance-tracking-reporting` feature branch adds M4 dashboards, reminders,
notifications and PDF/XLSX reporting. M2, M3 and M5 are not yet built; the seed
script supplies representative assignment-ledger data so M4 can be demonstrated
independently until policy and training publication flows are merged.

---

## Quick start

```bash
cd backend && npm install && cp .env.example .env
```

Fill in `MONGO_URI` (Atlas or local) and generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then seed and run:

Check the connection before anything else — it diagnoses the common Atlas
failures instead of leaving you with a generic timeout:

```bash
cd backend && npm run check:db
```

Then seed and run:

```bash
cd backend && npm run seed && npm run dev
```

**Building M2–M5?** Read [docs/ADDING-A-MODULE.md](docs/ADDING-A-MODULE.md) first.
It covers the conventions this foundation assumes — capability guards, scope
resolution, the error envelope, and the tests each new endpoint needs.

```bash
cd frontend && npm install && npm run dev
```

The frontend proxies `/api` to `http://localhost:5000` (see `vite.config.js`), so both
run same-origin in development and the auth cookies work without CORS configuration.

### Demo accounts

All use the password `Savikro#2026`.

| Employee ID | Role | Department | Notes |
|---|---|---|---|
| `SVK-001` | ADMIN | Administration | Admin console |
| `SVK-012` | MANAGER | Warehouse | Department dashboard |
| `SVK-020` | EMPLOYEE | Sales | My Tasks |
| `SVK-025` | EMPLOYEE | Administration | Forced password change on first login |
| `SVK-030` | EMPLOYEE | Sales | Deactivated — cannot log in |

---

## What M1 delivers

| Use case | Status |
|---|---|
| UC-02 Log in, with all alternate flows | Done |
| UC-03 Log out / session expiry | Done |
| UC-04 Change own password | Done |
| US-003 Forced change of a temporary password | Done |
| US-004 Lockout after 5 failed attempts | Done |
| US-005 30-minute inactivity timeout | Done |
| US-007 Immediate session revocation | Done (mechanism; admin UI is a later sprint) |
| RBAC middleware + capability catalogue | Done |
| Append-only audit log | Done |

Deferred: UC-01/UC-05 admin user management screens (accounts come from the seed
script for now) and real SMTP infrastructure.

## What M4 delivers

- Personal compliance status and outstanding assignment list.
- Department and organisation dashboards with enforced server-side scope.
- Policy/training rates, overdue metrics, department chart and staff drill-down data.
- Nightly overdue detection, automatic reminders and scoped manual reminders.
- In-app notification feed with optional development SMTP delivery.
- Filtered PDF and Excel compliance exports.
- Password step-up for organisation-wide compliance data after 30 minutes.

---

## Authentication design

**Both tokens are `httpOnly` cookies.** The SPA never reads, stores or attaches a
token — `withCredentials: true` is the entire client-side auth wiring, and an XSS
payload has nothing to steal.

- **Access token** — JWT, 15 minutes. Claims: `sub`, `role`, `department`,
  `tokenVersion`, `auth_time`.
- **Refresh token** — a 32-byte opaque random value, *not* a JWT. Only its SHA-256
  digest is stored, so a database dump yields no usable session credentials. Scoped
  to `Path=/api/v1/auth`, `SameSite=Strict`, 7 days, with a TTL index.

**Rotation and reuse detection.** Every refresh mints a new token and marks the old
one `revokedAt` with a `replacedBy` link. Presenting an already-exchanged token means
the value leaked, so the entire chain is revoked, `tokenVersion` is incremented
(killing live access tokens too), and `AUTH_TOKEN_REUSE_DETECTED` is audited.

**Authority comes from the database, not the token.** `authenticate` re-reads `role`,
`status` and `tokenVersion` on every request. A token minted before a role change,
deactivation or password change is still cryptographically valid — this is what makes
those changes take effect on the very next request rather than up to 15 minutes later.

### RBAC

`backend/src/constants/permissions.js` encodes the spec §3.3 permission matrix as
data. Routes declare a capability, never a role:

```js
router.get('/dashboard', authenticate,
  requireCapability(CAPABILITIES.COMPLIANCE_VIEW_DEPARTMENT), controller.dashboard);
```

`resolveScope` derives `{ level, department }` from `req.user` alone. A manager
passing `?department=SALES` for a department that is not theirs is refused with 403
and audited as `RBAC_SCOPE_VIOLATION` — the scope can be narrowed by a request, never
widened.

`GET /auth/me` returns the caller's capability list so the SPA can hide unusable
controls. That is a usability affordance; the middleware is the control (NFR-SEC-03).

---

## Testing

```bash
cd backend && npm test          # 267 tests
cd backend && npm run test:cov  # with coverage thresholds
```

Uses Jest, Supertest and `mongodb-memory-server`, so the suite needs no running
database and no credentials. The first run downloads a MongoDB binary (~60 MB,
cached in `~/.cache/mongodb-binaries` and reused afterwards).

Two suites are worth knowing about:

- `tests/unit/permissions.matrix.test.js` — the spec §3.3 table transcribed cell for
  cell, asserted against the capability catalogue. 54 assertions, one per cell.
- `tests/integration/rbac.negative-paths.test.js` — NFR-SEC-03's requirement, met
  literally: a real token for each role is fired at the guarded endpoint for *every*
  capability. Generated from the catalogue, so a capability added later without a
  guard cannot slip through.

Service-layer coverage runs 92–100% against the 60% floor NFR-MNT-02 sets.

---

## Layout

```
backend/src/
  config/         env (Zod-validated, throws in production), db
  constants/      http, appErrorCode, roles, auditActions, permissions
  models/         User, RefreshToken, AuditLog
  modules/auth/   routes -> controller -> service -> model
                  token / password / lockout services
  modules/audit/  append-only audit writer
  middleware/     authenticate, authorize, validate, rateLimit, security, errorHandler
  utils/          AppError, AppAssert, asyncHandler, cookies, date

frontend/src/
  api/            axios client with deduped refresh-on-401
  auth/           AuthContext, route guards, idle timer
  pages/          Login, ChangePassword, role landing pages
```

---

## Browser verification

The SPA has been run end to end against the API. Confirmed:

| Check | Result |
|---|---|
| Login as ADMIN / MANAGER / EMPLOYEE | Each lands on its own home screen |
| `localStorage`, `sessionStorage`, `document.cookie` | All empty — both tokens are httpOnly and unreadable by JS (NFR-SEC-07) |
| Hard reload of a deep link | Session restored by silent refresh; no login flash |
| MANAGER visiting `/admin` | Redirected to `/forbidden` |
| MANAGER department scope | Fixed to their own department, server-side |
| Forced password change (`SVK-025`) | Login lands on `/change-password`; navigating away bounces back; completing it unblocks the app |
| Logout | Cookies cleared, refresh token revoked |

A bug was found and fixed during this pass: React StrictMode double-invoked the
mount effect, firing two concurrent `POST /auth/refresh` calls. Because refresh
tokens rotate and a replayed token is treated as theft, that race could burn the
session. All refresh paths now share one de-duplicated in-flight promise
(`refreshSession` in `frontend/src/api/client.js`).

---

## Styling

Plain CSS in centralized stylesheets. Components carry semantic class names only —
no inline styles and no utility classes in the markup.

```
frontend/src/styles/
  index.css       entry point; imports the three below in order
  base.css        design tokens (CSS custom properties), reset, typography
  layout.css      app shell — top bar, main region, page containers, tile grid
  components.css  reusable primitives — card, button, field, alert, chip, spinner
```

Colours, radii, shadow and the 44 px touch target are CSS custom properties on
`:root` in `base.css`, so a theme change happens in one place. This departs from the
spec's mention of TailwindCSS, at the team's direction.

---

## Known gaps

- Account-lockout notification email is a marked call site awaiting the notification
  module.
