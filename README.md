# Savikro ISPM Platform

Security Policy Awareness & Compliance Management Platform for **Savikro Enterprises**, built for IE3072 – Information Security Policy Management (Group 14).

A web application that gives sales, warehouse, administration and management staff a single place to read and acknowledge security policies, complete role-specific security training, report incidents, and gives management a compliance dashboard with exportable audit reports.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite), React Router, Axios, Recharts |
| Backend | Node.js, Express.js |
| Database | MongoDB (Mongoose) |
| Auth | JWT (`jsonwebtoken`) + role-based access control enforced at the API layer |
| Security | `bcryptjs` (password hashing), `helmet` (HTTP headers), `zod` (input validation), `express-rate-limit` (login throttling), account lockout after repeated failed logins |
| Reporting | `exceljs` (Excel export), `pdfkit` (PDF export) |
| File uploads | `multer` (incident attachments) |

## Project structure

```
ISPM Porject/
├── backend/                  Express API
│   ├── src/
│   │   ├── config/           env, DB connection, shared enums/constants
│   │   ├── models/           Mongoose schemas
│   │   ├── middleware/       auth, RBAC, validation, rate limiting, errors, uploads
│   │   ├── controllers/      route handlers / business logic
│   │   ├── routes/           Express routers
│   │   ├── validators/       Zod request-body schemas
│   │   ├── utils/            asyncHandler, AppError, JWT helper
│   │   ├── app.js            Express app (middleware + routes)
│   │   └── server.js         entrypoint (connects DB, starts HTTP server)
│   ├── seed/seed.js          demo data (admin + one user per dept, policies, training, incident)
│   └── uploads/incidents/    uploaded incident attachments (gitignored)
│
├── frontend/                 React app (Vite)
│   └── src/
│       ├── api/              Axios service modules, one per resource
│       ├── context/          AuthContext (session, login/register/logout)
│       ├── components/       Layout, route guards, shared UI (Loader, Alert, Badge)
│       ├── pages/
│       │   ├── auth/         Login, Register
│       │   ├── dashboard/    role-aware landing page
│       │   ├── policies/     policy list + detail/acknowledge
│       │   ├── training/     training list + module/quiz view
│       │   ├── incidents/    report + list + detail (with admin triage)
│       │   ├── compliance/   dashboard with charts + Excel/PDF export
│       │   └── admin/        policy/training/incident/user management console
│       └── styles/index.css  design system (single stylesheet, CSS variables)
│
└── README.md                 you are here
```

## Architecture & modules

The system implements the five core modules from the project proposal:

1. **User Authentication & Authorization** — JWT sessions, bcrypt-hashed passwords, account lockout after repeated failed logins, and role-based access control enforced in Express middleware (`middleware/rbac.js`), not just hidden in the UI. A user's `role` doubles as their department (`sales` / `warehouse` / `administration` / `management`) for content targeting, plus a separate `admin` role for IT/system administrators. Self-registration cannot create an admin account.
2. **Policy Management** — Policies are versioned (`Policy.versions[]`); publishing a new version doesn't overwrite history, so there's a full audit trail of who published what and when. Employees acknowledge a specific version (`PolicyAcknowledgment`), and a new version requires re-acknowledgment.
3. **Security Training & Awareness** — Role-targeted training modules with an embedded quiz. Submissions are scored server-side against `correctOptionIndex`, which is never sent to non-admin clients before submission. Results are stored per user per module (`TrainingCompletion`).
4. **Compliance Tracking & Reporting** — `/api/compliance/overview` aggregates policy-acknowledgment and training-completion rates per department, visible to `admin` and `management` roles. Exportable as Excel (`exceljs`) or PDF (`pdfkit`) for audit purposes.
5. **Incident Reporting** — Any employee can report a suspicious email, lost device, unauthorized access attempt, malware, or other concern, with an optional attachment. Incidents get a default severity by type, a status timeline (`open → in_review → resolved`), and admins can triage/reassign them. Reporters can track their own report's status.

## Prerequisites

- **Node.js 18+** and npm
- **MongoDB** running locally (`mongodb://127.0.0.1:27017`) or a connection string to Atlas/another instance

> This project was scaffolded in a sandboxed environment without outbound internet access, so `npm install` could not be run here. Run the install steps below on your own machine.

## Setup

### 1. Backend

```bash
cd backend
npm install
copy .env.example .env
```

Edit `.env` if needed (Mongo URI, JWT secret, etc.), then:

```bash
npm run seed   # creates demo accounts, policies, training & an incident
npm run dev    # starts the API on http://localhost:5000
```

Demo accounts created by the seed script (password for all: `Passw0rd!`):

| Employee ID | Role |
|---|---|
| `ADM001` | Admin (IT administrator) |
| `SAL001` | Sales |
| `WHS001` | Warehouse |
| `ADN001` | Administration |
| `MGT001` | Management (compliance dashboard, read-only) |

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and `/uploads` to the backend on port 5000 (see `vite.config.js`), so the frontend `.env` can be left blank in development.

### 3. Build for production

```bash
cd frontend && npm run build
```

This outputs static files to `frontend/dist/`, which can be served by any static host or by the Express backend (e.g. via `express.static`) behind HTTPS/TLS termination (nginx, a cloud load balancer, etc.) — see the Non-Functional Requirements note below.

## Known limitations / suggested next steps

- The admin UI covers creating policies/training and publishing new policy versions, but there's no "edit existing training module" screen yet — the backend `PATCH /api/training/:id` endpoint exists and is ready for a form to be wired up to it.
- Email/SMS alerting for high-severity incidents is stubbed as a server log (`console.warn`) in `incidentController.js` — swap in a real mail/SMS provider call there for production use.
- No automated test suite yet. `backend` is structured for easy unit testing of controllers (pure functions wrapped by `asyncHandler`) — Jest + `mongodb-memory-server` would be a natural fit.
- `npm install` could not be run while building this scaffold (no outbound network access in the build sandbox), so dependency versions in `package.json` haven't been installed/lockfiled yet — run `npm install` in both `backend/` and `frontend/` on a machine with internet access to generate `package-lock.json` and verify everything resolves cleanly.

## Notes on scope vs. the proposal

- HTTPS/TLS termination, firewall configuration, and integration with Savikro's external ERP/inventory systems are explicitly out of scope per the proposal and are not implemented here — this is the web application prototype.
- The compliance report PDF/Excel export matches "2.3 Project Deliverables — an exportable (PDF/Excel) compliance report demonstrating the dashboard's audit output."
- Password policy, RBAC enforcement, HTTPS-ready headers (`helmet`), and rate limiting satisfy the Security non-functional requirement described in section 3.2 of the proposal; enabling actual TLS is a deployment-time concern (reverse proxy or hosting platform), not application code.
