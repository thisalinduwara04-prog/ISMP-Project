# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin tile console with a live widget dashboard, give administrators a persistent module-wise sidebar, and theme the admin area light-with-lime.

**Architecture:** A `RoleLayout` component picks `AdminLayout` (sidebar shell) for administrators and the existing `Layout` (topbar + tabs) for everyone else, so `App.jsx` changes in exactly one place and no route paths move. The dashboard composes four existing API calls into seven `<Link>` widgets. All new styling is scoped under `.admin-shell` in a new stylesheet, leaving employee and manager screens byte-identical.

**Tech Stack:** React 18, react-router-dom, Vite, plain CSS. No new dependencies.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-17-admin-dashboard-design.md` is the source of truth for this work.
- **No new dependencies.** No charting library, no state library, no form library, no icon package (CLAUDE.md rule 2). Charts are inline SVG; icons are inline SVG.
- **No backend changes.** No new endpoints, no route edits, no service edits. Every figure comes from an endpoint that already exists.
- **No inline styles**, except where the value is data rather than presentation (a bar width, a legend swatch colour). Those two exceptions are called out where they occur; everything else lives in `frontend/src/styles/`.
- **No frontend test suite exists.** This project has no vitest/jest setup for the frontend and adding one is out of scope. Every task is therefore gated on `npm run build` plus a named manual check, not on a unit test. This is a deliberate, spec-documented deviation from the usual TDD cycle.
- **Capability gating is an affordance, never the control** (NFR-SEC-03). The server re-checks every request regardless of what the sidebar renders.
- **Colour is never the only signal** (NFR-USE-03). Every state distinguished by colour also differs in text.
- **Verification commands:**
  - Frontend build: `cd frontend && npm run build`
  - Backend suite: `cd backend && npm test`
  - Dev server: `cd frontend && npm run dev`
- **Demo credentials** (from `backend/seed/seed.js`): admin `SVK-001`, password `Savikro#2026`. Re-seed with `cd backend && npm run seed`.

## API Response Shapes

Verified against the backend source. Later tasks depend on these being exactly right.

```js
// getDashboard()  -> GET /compliance/dashboard
{
  summary: { total, completed, outstanding, overdue, compliancePercent },
  departments: [ { department, total, completed, outstanding, overdue, compliancePercent } ],
  asOf: '2026-09-17T...',
  cached: false
}

// listIncidents() -> GET /incidents
// items capped at 500, sorted by severity rank descending (NOT by date)
{ items: [ { id, type, title, severity, status, occurredAt, createdAt, ... } ], total, escalatedOpen }
// NOTE: the report timestamp is `createdAt`. There is no `reportedAt` field.
// `occurredAt` is when the incident happened, which is user-supplied and optional.

// fetchUsers({ status: 'ACTIVE', limit: 1 }) -> GET /users
// paginates: default limit 25, max 100 - read the TOTAL, never count the array
{ users: [...], pagination: { page, limit, total, pages } }

// fetchAuditLogs({ limit: 5 }) -> GET /audit-logs
// sorted timestamp descending (newest first), default limit 50, max 200
{ entries: [ { id, timestamp, action, outcome, actor, entityType, ... } ], pagination: {...} }
```

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `frontend/src/components/RoleLayout.jsx` | Picks the shell from `user.role`. Nothing else. |
| `frontend/src/components/AdminIcon.jsx` | Inline SVG icon set, one path per name. |
| `frontend/src/components/AdminSidebar.jsx` | The capability-filtered nav list. |
| `frontend/src/components/AdminLayout.jsx` | Shell: sidebar + header + `<Outlet />`. |
| `frontend/src/components/StatCard.jsx` | One KPI widget. |
| `frontend/src/components/SeverityPie.jsx` | Donut + legend. |
| `frontend/src/components/DepartmentBars.jsx` | Per-department compliance bars. |
| `frontend/src/components/ActivityList.jsx` | Recent audit entries. |
| `frontend/src/styles/admin.css` | Everything scoped under `.admin-shell`. |

**Modify:**

| File | Change |
|---|---|
| `frontend/src/pages/home/AdminConsole.jsx` | Rewritten from tile grid to widget dashboard. |
| `frontend/src/App.jsx` | `<Route element={<Layout />}>` becomes `<Route element={<RoleLayout />}>`. |
| `frontend/src/styles/index.css` | Add `@import './admin.css';` as the last import. |

**Not modified:** `Layout.jsx`. Administrators simply never see it.

---

### Task 1: Theme tokens and the admin shell stylesheet

Creates the stylesheet the rest of the work styles against. Nothing renders differently yet, so this task is verified by the build alone.

**Files:**
- Create: `frontend/src/styles/admin.css`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces: the `.admin-shell` scope and these class names, used by every later task: `admin-shell`, `admin-shell__sidebar`, `admin-shell__brand`, `admin-shell__body`, `admin-shell__header`, `admin-shell__title`, `admin-shell__subtitle`, `admin-shell__controls`, `admin-shell__main`, `admin-nav`, `admin-nav__link`, `admin-nav__link--active`, `admin-nav__icon`, `admin-grid`, `admin-grid__half`, `admin-grid__three`, `admin-grid__full`, `stat-card`, `stat-card--wide`, `stat-card--alert`, `stat-card__label`, `stat-card__value`, `stat-card__sub`, `widget`, `widget__head`, `widget__title`, `widget__subtitle`, `pie`, `pie__legend`, `pie__swatch`, `pie__count`, `dept-bar`, `dept-bar__track`, `dept-bar__fill`, `dept-bar__value`, `activity`, `activity__row`, `activity__when`.

- [ ] **Step 1: Create the stylesheet**

Create `frontend/src/styles/admin.css`:

```css
/* ---------------------------------------------------------------------------
   Administrator area - light, minimal, lime accent.

   Everything here is scoped under `.admin-shell`, which only AdminLayout
   renders. Employee and manager screens never match these selectors, so the
   navy system in base.css is left exactly as it was.
   --------------------------------------------------------------------------- */

.admin-shell {
  --admin-canvas: #ebecee;
  --admin-surface: #ffffff;
  --admin-accent: #dff264;
  --admin-accent-ink: #1b2007;
  --admin-ink: #14161a;
  --admin-ink-soft: #8a9099;
  --admin-line: #e3e5e8;
  --admin-alert: #b3352e;
  --admin-alert-tint: #fdeeed;
  --admin-pill: 999px;
  --admin-radius: 20px;

  display: grid;
  grid-template-columns: 248px 1fr;
  min-height: 100vh;
  background: var(--admin-canvas);
  color: var(--admin-ink);
}

/* --- Sidebar --- */

.admin-shell__sidebar {
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.admin-shell__brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.5rem;
  color: var(--admin-ink);
  text-decoration: none;
  font-weight: 700;
}

.admin-nav {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.admin-nav__link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: var(--touch-target);
  padding: 0.625rem 1rem;
  border-radius: var(--admin-pill);
  background: transparent;
  color: var(--admin-ink);
  text-decoration: none;
  font-size: 0.9375rem;
}

.admin-nav__link:hover {
  background: rgba(255, 255, 255, 0.7);
}

.admin-nav__link--active {
  background: var(--admin-accent);
  color: var(--admin-accent-ink);
  font-weight: 600;
}

.admin-nav__icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
}

/* --- Body and header --- */

.admin-shell__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 1.5rem 1.5rem 3rem 0;
}

.admin-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.admin-shell__title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
}

.admin-shell__subtitle {
  margin: 0;
  color: var(--admin-ink-soft);
  font-size: 0.875rem;
}

.admin-shell__controls {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem;
  background: var(--admin-surface);
  border-radius: var(--admin-pill);
}

.admin-shell__main {
  min-width: 0;
}

/* --- Dashboard grid --- */

.admin-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

/* The grid is 4 columns and the priority card spans 2, so each row has to add
   up to exactly 4 or the layout wraps leaving holes:
     row 1  open incidents (2) + compliance (1) + overdue (1)
     row 2  severity donut (2) + department bars (2)
     row 3  active users (1) + recent activity (3)              */
.admin-grid__half { grid-column: span 2; }
.admin-grid__three { grid-column: span 3; }
.admin-grid__full { grid-column: 1 / -1; }

/* --- Stat cards --- */

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1.25rem;
  background: var(--admin-surface);
  border-radius: var(--admin-radius);
  color: inherit;
  text-decoration: none;
}

.stat-card:hover { box-shadow: 0 6px 20px rgba(20, 22, 26, 0.08); }

.stat-card--wide { grid-column: span 2; }

.stat-card--alert {
  background: var(--admin-alert-tint);
  box-shadow: inset 0 0 0 1px var(--admin-alert);
}

.stat-card__label {
  font-size: 0.8125rem;
  color: var(--admin-ink-soft);
}

.stat-card__value {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
}

.stat-card--alert .stat-card__value { color: var(--admin-alert); }

.stat-card__sub {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--admin-ink-soft);
}

.stat-card--alert .stat-card__sub {
  color: var(--admin-alert);
  font-weight: 600;
}

/* --- Widgets --- */

.widget {
  display: block;
  padding: 1.25rem;
  background: var(--admin-surface);
  border-radius: var(--admin-radius);
  color: inherit;
  text-decoration: none;
}

.widget:hover { box-shadow: 0 6px 20px rgba(20, 22, 26, 0.08); }

.widget__head { margin-bottom: 1rem; }

.widget__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.widget__subtitle {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--admin-ink-soft);
}

/* --- Severity donut --- */

.pie {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.pie__legend {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  min-width: 11rem;
  list-style: none;
  font-size: 0.875rem;
}

.pie__legend li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pie__swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.pie__count {
  margin-left: auto;
  padding-left: 1rem;
  font-weight: 600;
}

/* --- Department bars --- */

.dept-bar {
  display: grid;
  grid-template-columns: 8rem 1fr 3rem;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  margin-bottom: 0.625rem;
}

.dept-bar__track {
  height: 8px;
  border-radius: var(--admin-pill);
  background: var(--admin-line);
  overflow: hidden;
}

.dept-bar__fill {
  display: block;
  height: 100%;
  border-radius: var(--admin-pill);
  background: var(--admin-accent);
}

.dept-bar__value {
  text-align: right;
  font-weight: 600;
}

/* --- Activity list --- */

.activity { font-size: 0.875rem; }

.activity__row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--admin-line);
}

.activity__row:last-child { border-bottom: 0; }

.activity__when {
  color: var(--admin-ink-soft);
  white-space: nowrap;
}

/* --- Scoped overrides for shared pages ---
   /policies, /training and the rest were built for the navy surface. These few
   rules keep them coherent when an administrator opens them inside this shell.
   --------------------------------------------------------------------------- */

.admin-shell .card {
  border-radius: var(--admin-radius);
  border: 0;
  box-shadow: none;
}

.admin-shell .table { border-radius: var(--admin-radius); }

.admin-shell .btn--primary {
  background: var(--admin-accent);
  border-color: var(--admin-accent);
  color: var(--admin-accent-ink);
}

/* --- Narrow screens ---
   The sidebar becomes a horizontal scrolling strip above the content rather
   than a drawer: no JavaScript, and no new dependency.
   --------------------------------------------------------------------------- */

@media (max-width: 900px) {
  .admin-shell { grid-template-columns: 1fr; }

  .admin-shell__sidebar {
    flex-direction: row;
    align-items: center;
    gap: 1rem;
    overflow-x: auto;
    padding: 1rem;
  }

  .admin-nav {
    flex-direction: row;
    gap: 0.5rem;
  }

  .admin-nav__link { white-space: nowrap; }

  .admin-shell__body { padding: 0 1rem 2rem; }

  .admin-grid { grid-template-columns: 1fr; }

  .stat-card--wide,
  .admin-grid__half,
  .admin-grid__three,
  .admin-grid__full { grid-column: 1 / -1; }
}
```

Note `--admin-alert` is `#b3352e`, not the `#e0574f` named in the spec. `#e0574f` is used as a *chart fill* in Task 6, where it carries no text. Here it is used for text on a white-ish tint, and `#e0574f` measures about 3.4:1 against `--admin-alert-tint` — below the 4.5:1 that NFR-USE-03 commits to. `#b3352e` clears it at roughly 5.9:1 while reading as the same red.

- [ ] **Step 2: Import it**

In `frontend/src/styles/index.css`, add as the final line:

```css
@import './admin.css';
```

It goes last so the scoped overrides win over `components.css`.

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: builds with no errors. The CSS bundle grows by roughly 4-5 kB. Nothing renders differently yet, because no component uses these classes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/admin.css frontend/src/styles/index.css
git commit -m "Add scoped admin theme stylesheet"
```

---

### Task 2: Icon set

**Files:**
- Create: `frontend/src/components/AdminIcon.jsx`

**Interfaces:**
- Consumes: `.admin-nav__icon` (Task 1).
- Produces: `<AdminIcon name="..." className="..." />`. Valid names: `dashboard`, `users`, `policies`, `training`, `compliance`, `incidents`, `audit`, `bell`, `key`, `exit`, `alert`. `className` defaults to `'admin-nav__icon'`. Renders a 24-viewBox `<svg>` with `aria-hidden="true"`. An unknown name returns `null` rather than throwing.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/AdminIcon.jsx`:

```jsx
// Inline SVG icons for the admin shell. Inline rather than an icon package,
// because the project takes no dependency it can avoid (CLAUDE.md rule 2).
//
// Every icon is decorative: the sidebar and the buttons always carry a text
// label beside them, so these are aria-hidden and never the only signal.

const PATHS = {
  dashboard: 'M3 3h7v7H3V3zm11 0h7v4h-7V3zM3 14h7v7H3v-7zm11-3h7v10h-7V11z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  policies: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 0v6h6M8 13h8M8 17h8',
  training: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5',
  compliance: 'M3 3v18h18M7 16l4-4 3 3 5-6',
  incidents: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  audit: 'M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3',
  exit: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9',
  alert: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
};

const AdminIcon = ({ name, className = 'admin-nav__icon' }) => {
  const path = PATHS[name];
  if (!path) return null;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
};

export default AdminIcon;
```

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AdminIcon.jsx
git commit -m "Add inline SVG icon set for the admin shell"
```

---

### Task 3: Sidebar

**Files:**
- Create: `frontend/src/components/AdminSidebar.jsx`

**Interfaces:**
- Consumes: `AdminIcon` (Task 2), `.admin-nav*` and `.admin-shell__sidebar` (Task 1), `useAuth().can`, `CAPABILITIES`.
- Produces: `<AdminSidebar />`, taking no props.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/AdminSidebar.jsx`:

```jsx
import { Link, NavLink } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { CAPABILITIES } from '../constants';
import AdminIcon from './AdminIcon';

// Module-wise navigation for the administrator shell.
//
// My tasks and Department are deliberately absent: both are built for other
// roles, and an admin holds COMPLIANCE_VIEW_DEPARTMENT only incidentally. This
// removes them from NAVIGATION only - both routes stay reachable by URL and the
// API enforces access exactly as before.
//
// Capability-filtered like the tiles it replaces: an affordance, never the
// control (NFR-SEC-03).
const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: 'dashboard', capability: CAPABILITIES.USER_MANAGE, end: true },
  { to: '/admin/users', label: 'Users', icon: 'users', capability: CAPABILITIES.USER_MANAGE },
  { to: '/policies', label: 'Policies', icon: 'policies', capability: CAPABILITIES.POLICY_AUTHOR },
  { to: '/training', label: 'Training', icon: 'training', capability: CAPABILITIES.TRAINING_AUTHOR },
  { to: '/compliance', label: 'Compliance', icon: 'compliance', capability: CAPABILITIES.COMPLIANCE_VIEW_ORGANISATION },
  { to: '/incidents', label: 'Incidents', icon: 'incidents', capability: CAPABILITIES.INCIDENT_TRIAGE, end: true },
  { to: '/admin/audit-logs', label: 'Audit log', icon: 'audit', capability: CAPABILITIES.AUDIT_VIEW },
];

const AdminSidebar = () => {
  const { can } = useAuth();
  const items = NAV_ITEMS.filter((item) => can(item.capability));

  return (
    <aside className="admin-shell__sidebar">
      <Link to="/admin" className="admin-shell__brand">
        <span className="topbar__mark">SV</span>
        <span>Savikro</span>
      </Link>

      <nav className="admin-nav" aria-label="Main">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
            }
          >
            <AdminIcon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
```

`end: true` on `/admin` and `/incidents` is load-bearing. Without it, `/admin` stays highlighted while on `/admin/users`, and `/incidents` while on `/incidents/:id`.

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: builds with no errors. Still not rendered anywhere.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AdminSidebar.jsx
git commit -m "Add module-wise admin sidebar"
```

---

### Task 4: Shell and role-based layout selection

The task that changes what an administrator sees. After it, admins get the sidebar everywhere and lose the My tasks / Department tabs.

**Files:**
- Create: `frontend/src/components/AdminLayout.jsx`
- Create: `frontend/src/components/RoleLayout.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `AdminSidebar` (Task 3), `AdminIcon` (Task 2), `.admin-shell*` (Task 1).
- Produces: `<RoleLayout />`, used as a route `element`, rendering `<Outlet />` through whichever shell the role selects.

- [ ] **Step 1: Create AdminLayout**

Create `frontend/src/components/AdminLayout.jsx`:

```jsx
import { Link, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { useIdleTimer } from '../auth/useIdleTimer';
import { ROLE_LABELS, DEPARTMENT_LABELS } from '../constants';
import AdminIcon from './AdminIcon';
import AdminSidebar from './AdminSidebar';

// First word of the full name, so the greeting reads "Welcome, Dilhan" rather
// than repeating the whole name the identity line already carries. Falls back
// to the whole string when there is no space in it.
const firstNameOf = (fullName = '') => fullName.trim().split(/\s+/)[0] || fullName;

const AdminLayout = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // US-005, same rule as the employee shell: an unattended shared terminal
  // signs itself out. Repeated here rather than lifted into a shared parent -
  // the two shells are independent, and one hook call is cheaper than the
  // coupling a shared wrapper would introduce.
  useIdleTimer(
    async () => {
      await logout();
      navigate('/login', { replace: true, state: { reason: 'idle' } });
    },
    { enabled: isAuthenticated, timeoutMinutes: 30 }
  );

  return (
    <div className="admin-shell">
      <AdminSidebar />

      <div className="admin-shell__body">
        <header className="admin-shell__header">
          <div>
            <h1 className="admin-shell__title">Welcome, {firstNameOf(user?.fullName)}</h1>
            <p className="admin-shell__subtitle">
              {ROLE_LABELS[user?.role]} · {DEPARTMENT_LABELS[user?.department]}
            </p>
          </div>

          <div className="admin-shell__controls">
            <Link to="/notifications" className="btn btn--ghost btn--sm">
              <AdminIcon name="bell" />
              Notifications
            </Link>
            <Link to="/change-password" className="btn btn--ghost btn--sm">
              <AdminIcon name="key" />
              Password
            </Link>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <AdminIcon name="exit" />
              Sign out
            </button>
          </div>
        </header>

        <main className="admin-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
```

- [ ] **Step 2: Create RoleLayout**

Create `frontend/src/components/RoleLayout.jsx`:

```jsx
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../constants';
import AdminLayout from './AdminLayout';
import Layout from './Layout';

// Chooses the shell from the role, not from the route.
//
// The admin sidebar offers Policies, Training, Compliance and Incidents, and
// those routes are shared with other roles. Choosing by route would drop an
// administrator out of the sidebar the moment they opened /policies.
const RoleLayout = () => {
  const { user } = useAuth();
  return user?.role === ROLES.ADMIN ? <AdminLayout /> : <Layout />;
};

export default RoleLayout;
```

- [ ] **Step 3: Wire it into App.jsx**

Three edits in `frontend/src/App.jsx`:

1. Remove the now-unused direct import:

```jsx
import Layout from './components/Layout';
```

`RoleLayout` imports `Layout` itself, so leaving this line would be an unused import.

2. Add in its place:

```jsx
import RoleLayout from './components/RoleLayout';
```

3. Change the single layout route element. Find:

```jsx
      <Route element={<Layout />}>
```

Replace with:

```jsx
      <Route element={<RoleLayout />}>
```

- [ ] **Step 4: Verify the build**

Run: `cd frontend && npm run build`
Expected: builds with no errors.

- [ ] **Step 5: Manual check - the shell swap**

Start the backend, then `cd frontend && npm run dev`.

Sign in as **admin** (`SVK-001` / `Savikro#2026`):
- the left sidebar appears with Dashboard, Users, Policies, Training, Compliance, Incidents, Audit log
- **no My tasks item, no Department item**
- the header reads "Welcome, Dilhan"
- clicking Policies keeps the sidebar visible - this is the role-not-route decision working
- exactly one nav item is highlighted at a time. On `/admin/users`, Dashboard must NOT also be lime.

Sign in as an **employee** (any employee `SVK-0xx` from the seed table):
- the old topbar and horizontal tabs are unchanged
- My tasks is still present

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AdminLayout.jsx frontend/src/components/RoleLayout.jsx frontend/src/App.jsx
git commit -m "Give administrators their own sidebar shell"
```

---

### Task 5: StatCard

**Files:**
- Create: `frontend/src/components/StatCard.jsx`

**Interfaces:**
- Consumes: `.stat-card*` (Task 1), `AdminIcon` (Task 2).
- Produces:

```jsx
<StatCard
  label="Open incidents"   // string, required
  value={12}               // string | number | null - null renders an em dash
  sub="open or in review"  // string, optional, the line under the value
  to="/incidents"          // string, required, where the card links
  tone="alert"             // 'default' | 'alert', optional, default 'default'
  wide                     // boolean, optional, spans two grid columns
  loading                  // boolean, optional, renders a placeholder
  error="Unavailable"      // string, optional, replaces the value
/>
```

- [ ] **Step 1: Create the component**

Create `frontend/src/components/StatCard.jsx`:

```jsx
import { Link } from 'react-router-dom';

import AdminIcon from './AdminIcon';

// One dashboard figure, as a link into the module it summarises.
//
// A Link rather than a div with an onClick, so the card takes focus, activates
// on Enter and opens in a new tab - the same reasoning as the tiles it
// replaced.
//
// `tone="alert"` changes the colour AND adds the warning glyph, and callers
// always pass a `sub` line saying what is wrong in words. The state is never
// carried by colour alone (NFR-USE-03).
const StatCard = ({
  label,
  value,
  sub,
  to,
  tone = 'default',
  wide = false,
  loading = false,
  error = '',
}) => {
  const classes = ['stat-card'];
  if (wide) classes.push('stat-card--wide');
  if (tone === 'alert') classes.push('stat-card--alert');

  const shown = value === null || value === undefined ? '—' : value;

  return (
    <Link to={to} className={classes.join(' ')}>
      <span className="stat-card__label">{label}</span>

      <span className="stat-card__value">
        {loading ? '…' : null}
        {!loading && error ? <span className="stat-card__sub">{error}</span> : null}
        {!loading && !error ? shown : null}
      </span>

      {sub && !error ? (
        <span className="stat-card__sub">
          {tone === 'alert' ? <AdminIcon name="alert" /> : null}
          {sub}
        </span>
      ) : null}
    </Link>
  );
};

export default StatCard;
```

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StatCard.jsx
git commit -m "Add StatCard dashboard widget"
```

---

### Task 6: SeverityPie

**Files:**
- Create: `frontend/src/components/SeverityPie.jsx`

**Interfaces:**
- Consumes: `.pie*` (Task 1), `EmptyState` from `./EmptyState`, `SEVERITY_LABELS` from `../constants`.
- Produces: `<SeverityPie counts={{ CRITICAL: 2, HIGH: 5, MEDIUM: 4, LOW: 3 }} />`. Every key optional, missing keys count as 0, all-zero renders `EmptyState`.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/SeverityPie.jsx`:

```jsx
import EmptyState from './EmptyState';
import { SEVERITY_LABELS } from '../constants';

// Donut drawn with stroke-dasharray on concentric circles: each slice is one
// circle whose dash pattern exposes only its own arc, offset to start where the
// previous slice ended. No charting library (CLAUDE.md rule 2).
//
// The legend carries the label and count for every severity, so the chart reads
// correctly with colour ignored entirely (NFR-USE-03). The slices hold no text,
// so their fills are not a text-contrast concern.

const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const COLOURS = {
  CRITICAL: '#e0574f',
  HIGH: '#f0a23c',
  MEDIUM: '#3fb8b0',
  LOW: '#b9bec7',
};

// Every dash length below is a fraction of this circumference, which is what
// makes the arcs add up to exactly one turn.
const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SeverityPie = ({ counts = {} }) => {
  const slices = ORDER.map((severity) => ({ severity, count: counts[severity] || 0 }));
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  if (total === 0) {
    return (
      <EmptyState
        title="No incidents reported"
        body="Nothing has been reported yet, so there is nothing to chart."
      />
    );
  }

  const label = slices
    .map((slice) => `${SEVERITY_LABELS[slice.severity]} ${slice.count}`)
    .join(', ');

  // Running offset, in the same units as the dash array.
  let consumed = 0;

  return (
    <div className="pie">
      <svg width="150" height="150" viewBox="0 0 150 150" role="img"
        aria-label={`Incidents by severity: ${label}`}
      >
        <g transform="rotate(-90 75 75)">
          {slices.map((slice) => {
            if (slice.count === 0) return null;
            const length = (slice.count / total) * CIRCUMFERENCE;
            const arc = (
              <circle
                key={slice.severity}
                cx="75"
                cy="75"
                r={RADIUS}
                fill="none"
                stroke={COLOURS[slice.severity]}
                strokeWidth="24"
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-consumed}
              />
            );
            consumed += length;
            return arc;
          })}
        </g>
        <text x="75" y="75" textAnchor="middle" dominantBaseline="central"
          fontSize="26" fontWeight="700" fill="#14161a"
        >
          {total}
        </text>
      </svg>

      <ul className="pie__legend">
        {slices.map((slice) => (
          <li key={slice.severity}>
            <span
              className="pie__swatch"
              style={{ background: COLOURS[slice.severity] }}
              aria-hidden="true"
            />
            {SEVERITY_LABELS[slice.severity]}
            <span className="pie__count">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SeverityPie;
```

The `style` on the swatch is a deliberate exception to the no-inline-styles rule: the colour is data, it must match the slice it labels, and keeping one source for the four values prevents the legend and the chart drifting apart. The alternative is four `.pie__swatch--critical` modifier classes in `admin.css` duplicating the same hex values. Pick one; do not ship both.

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SeverityPie.jsx
git commit -m "Add severity donut chart"
```

---

### Task 7: DepartmentBars and ActivityList

Two small presentational components, grouped because neither is worth its own review gate.

**Files:**
- Create: `frontend/src/components/DepartmentBars.jsx`
- Create: `frontend/src/components/ActivityList.jsx`

**Interfaces:**
- Consumes: `.dept-bar*` and `.activity*` (Task 1), `DEPARTMENT_LABELS` from `../constants`, `EmptyState`.
- Produces:
  - `<DepartmentBars departments={[{ department: 'SALES', compliancePercent: 78 }]} />`
  - `<ActivityList entries={[{ id, timestamp, action, actor }]} />`, where `actor` may be `null`.

- [ ] **Step 1: Create DepartmentBars**

Create `frontend/src/components/DepartmentBars.jsx`:

```jsx
import EmptyState from './EmptyState';
import { DEPARTMENT_LABELS } from '../constants';

// One bar per department, straight from the `departments` array the compliance
// dashboard endpoint already returns. The percentage is printed beside every
// bar, so the comparison never depends on judging bar lengths by eye.
const DepartmentBars = ({ departments = [] }) => {
  if (departments.length === 0) {
    return <EmptyState title="No compliance data" body="No assignments have been issued yet." />;
  }

  return (
    <div>
      {departments.map((row) => (
        <div key={row.department} className="dept-bar">
          <span>{DEPARTMENT_LABELS[row.department] || row.department}</span>
          <span className="dept-bar__track">
            <span className="dept-bar__fill" style={{ width: `${row.compliancePercent}%` }} />
          </span>
          <span className="dept-bar__value">{row.compliancePercent}%</span>
        </div>
      ))}
    </div>
  );
};

export default DepartmentBars;
```

The inline `width` is the same data-not-presentation exception as the pie swatch: a percentage that only exists at runtime cannot come from a stylesheet.

- [ ] **Step 2: Create ActivityList**

Create `frontend/src/components/ActivityList.jsx`:

```jsx
import EmptyState from './EmptyState';

// The newest few audit entries. The audit endpoint already sorts newest-first,
// so this renders what it is given in the order it arrives.
//
// Actions are humanised the same way the audit browser does it: underscores to
// spaces, lower case.
const humanise = (action = '') => action.replaceAll('_', ' ').toLowerCase();

const ActivityList = ({ entries = [] }) => {
  if (entries.length === 0) {
    return <EmptyState title="No recent activity" body="Nothing has been recorded yet." />;
  }

  return (
    <div className="activity">
      {entries.map((entry) => (
        <div key={entry.id} className="activity__row">
          <span>
            {humanise(entry.action)}
            {entry.actor?.fullName ? ` · ${entry.actor.fullName}` : ''}
          </span>
          <span className="activity__when">{new Date(entry.timestamp).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default ActivityList;
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: builds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DepartmentBars.jsx frontend/src/components/ActivityList.jsx
git commit -m "Add department bars and activity list widgets"
```

---

### Task 8: The dashboard page

Assembles everything and replaces the tile grid.

**Files:**
- Modify: `frontend/src/pages/home/AdminConsole.jsx` (full rewrite)

**Interfaces:**
- Consumes: `StatCard` (Task 5), `SeverityPie` (Task 6), `DepartmentBars` and `ActivityList` (Task 7), `.admin-grid*` and `.widget*` (Task 1).
- Produces: the `/admin` screen. Nothing imports it but the router.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `frontend/src/pages/home/AdminConsole.jsx` with:

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDashboard } from '../../api/compliance';
import { listIncidents } from '../../api/incidents';
import { fetchUsers } from '../../api/users';
import { fetchAuditLogs } from '../../api/audit';
import ActivityList from '../../components/ActivityList';
import DepartmentBars from '../../components/DepartmentBars';
import SeverityPie from '../../components/SeverityPie';
import StatCard from '../../components/StatCard';

// M1 admin dashboard.
//
// Composed from endpoints that already exist rather than from a new aggregate
// route, which keeps the change inside spec section 8. Four requests go out in
// parallel and each lands in its own piece of state, so one failing endpoint
// degrades only the widgets that depend on it.

const OPEN_STATUSES = ['OPEN', 'IN_REVIEW'];

// The 20 most recently reported, regardless of status. The server sorts by
// severity rank rather than by date, so the re-sort happens here.
//
// `createdAt` is the report timestamp - NOT `occurredAt`, which is when the
// employee says the incident happened and is optional. Sorting on a field the
// serialiser does not emit would make every comparison NaN, leaving the array
// in severity order while looking like it had been sorted by date.
const RECENT_LIMIT = 20;

const tallyBySeverity = (items) =>
  items.reduce((counts, incident) => {
    counts[incident.severity] = (counts[incident.severity] || 0) + 1;
    return counts;
  }, {});

const AdminConsole = () => {
  const [compliance, setCompliance] = useState({ data: null, error: '' });
  const [incidents, setIncidents] = useState({ data: null, error: '' });
  const [activeUsers, setActiveUsers] = useState({ data: null, error: '' });
  const [activity, setActivity] = useState({ data: null, error: '' });

  useEffect(() => {
    let active = true;

    const settle = (setter) => ({
      ok: (data) => { if (active) setter({ data, error: '' }); },
      fail: (requestError) => {
        if (active) setter({ data: null, error: requestError.message || 'Unavailable' });
      },
    });

    const c = settle(setCompliance);
    getDashboard().then(c.ok).catch(c.fail);

    const i = settle(setIncidents);
    listIncidents().then(i.ok).catch(i.fail);

    // The user list paginates at 25 by default, so the array is one page and
    // not the whole organisation. Ask for a single row and read the server's
    // own total rather than counting what came back.
    const u = settle(setActiveUsers);
    fetchUsers({ status: 'ACTIVE', limit: 1 }).then(u.ok).catch(u.fail);

    const a = settle(setActivity);
    fetchAuditLogs({ limit: 5 }).then(a.ok).catch(a.fail);

    return () => { active = false; };
  }, []);

  const items = incidents.data?.items || [];
  const openCount = items.filter((incident) => OPEN_STATUSES.includes(incident.status)).length;
  const escalated = incidents.data?.escalatedOpen || 0;

  const recent = [...items]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, RECENT_LIMIT);

  const summary = compliance.data?.summary;

  return (
    <div className="admin-grid">
      <StatCard
        label="Open incidents"
        value={incidents.data ? (openCount === 0 ? 'No open incidents' : openCount) : null}
        sub={escalated > 0 ? `${escalated} high or critical need attention` : 'open or in review'}
        to="/incidents"
        tone={escalated > 0 ? 'alert' : 'default'}
        wide
        loading={!incidents.data && !incidents.error}
        error={incidents.error}
      />

      <StatCard
        label="Compliance"
        value={summary ? `${summary.compliancePercent}%` : null}
        sub="across the organisation"
        to="/compliance"
        loading={!compliance.data && !compliance.error}
        error={compliance.error}
      />

      <StatCard
        label="Overdue items"
        value={summary ? summary.overdue : null}
        sub="past their due date"
        to="/compliance"
        loading={!compliance.data && !compliance.error}
        error={compliance.error}
      />

      <Link to="/incidents" className="widget admin-grid__half">
        <div className="widget__head">
          <h2 className="widget__title">Recent incidents by severity</h2>
          <p className="widget__subtitle">latest {RECENT_LIMIT}</p>
        </div>
        {incidents.error
          ? <p className="muted">{incidents.error}</p>
          : <SeverityPie counts={tallyBySeverity(recent)} />}
      </Link>

      <Link to="/compliance" className="widget admin-grid__half">
        <div className="widget__head">
          <h2 className="widget__title">Compliance by department</h2>
          <p className="widget__subtitle">completed assignments</p>
        </div>
        {compliance.error
          ? <p className="muted">{compliance.error}</p>
          : <DepartmentBars departments={compliance.data?.departments || []} />}
      </Link>

      <StatCard
        label="Active users"
        value={activeUsers.data ? activeUsers.data.pagination.total : null}
        sub="accounts in use"
        to="/admin/users"
        loading={!activeUsers.data && !activeUsers.error}
        error={activeUsers.error}
      />

      <Link to="/admin/audit-logs" className="widget admin-grid__three">
        <div className="widget__head">
          <h2 className="widget__title">Recent activity</h2>
          <p className="widget__subtitle">latest security events</p>
        </div>
        {activity.error
          ? <p className="muted">{activity.error}</p>
          : <ActivityList entries={activity.data?.entries || []} />}
      </Link>
    </div>
  );
};

export default AdminConsole;
```

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: builds with no errors.

- [ ] **Step 3: Manual check - widgets and navigation**

Backend running and seeded (`cd backend && npm run seed`), then `cd frontend && npm run dev`.

Sign in as admin and confirm on `/admin`:
- **Open incidents** spans two columns and sits first
- it is in the **escalated** state, because the seed includes HIGH/CRITICAL open incidents: red treatment, warning glyph, and "N high or critical need attention"
- Compliance shows a percentage, Overdue a number
- **Active users** shows the organisation total. If it reads exactly `25`, the pagination fix did not take - it is reading the page length instead of `pagination.total`.
- the donut renders with a legend listing all four severities and their counts
- department bars render one row per department with the percentage printed
- recent activity lists five entries, newest first

Click each widget and confirm the destination, in the order they appear:
`/incidents` (open incidents), `/compliance` (compliance), `/compliance` (overdue),
`/incidents` (donut), `/compliance` (department bars), `/admin/users` (active users),
`/admin/audit-logs` (recent activity).

Also confirm the grid has **no gaps**: three full rows, nothing wrapping oddly.

Tab through the dashboard: every widget takes focus and activates on Enter.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/home/AdminConsole.jsx
git commit -m "Replace the admin tile console with a widget dashboard"
```

---

### Task 9: Full verification pass

No new code. The gate that catches what per-task checks could not.

**Files:** none.

- [ ] **Step 1: Build**

Run: `cd frontend && npm run build`
Expected: no errors.

- [ ] **Step 2: Backend suite**

Run: `cd backend && npm test`
Expected: all suites pass. This work touched no backend file, so a failure here means something unrelated broke and must be understood before merging.

- [ ] **Step 3: Check the calm state of the priority widget**

The seed produces escalated incidents, so the calm path is otherwise never exercised. As admin, open `/incidents` and resolve every HIGH and CRITICAL incident that is OPEN or IN_REVIEW. Return to `/admin`.

Expected: the card drops its alert treatment, the subtitle reverts to "open or in review", and the figure stays correct. Re-seed afterwards with `cd backend && npm run seed`.

- [ ] **Step 4: Check the shared pages under the admin shell**

As admin, visit `/policies`, `/training`, `/compliance`, `/incidents`, `/admin/users`, `/admin/audit-logs`.

Expected: each keeps the sidebar and picks up the rounded borderless surface. Look specifically for a table that has lost its header contrast, or a primary button now rendering lime-on-white too faintly to read - those are the likeliest casualties of the override block in Task 1.

- [ ] **Step 5: Check the other roles are untouched**

Sign in as an employee, then as a manager.

Expected: topbar and horizontal tabs exactly as before, navy throughout, no lime anywhere. My tasks present for the employee, Department present for the manager.

- [ ] **Step 6: Check the narrow layout**

At 900px and below: the sidebar becomes a horizontal scrolling strip, the grid collapses to one column, and the page does not scroll horizontally.

- [ ] **Step 7: Check colour independence**

DevTools → Rendering → Emulate vision deficiencies → Achromatopsia.

Expected: the escalated card is still identifiable from its glyph and wording, and every donut slice is still identifiable from the legend's labels and counts.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found in admin dashboard verification"
```

---

## Out of Scope

Recorded so nobody adds them mid-implementation:

- A backend aggregate endpoint for dashboard figures. Would deviate from spec section 8.
- Any frontend test framework.
- Restyling the employee or manager shells.
- Blocking admins from `/my-tasks` or `/department` at the route or API level. This work removes them from navigation only; both stay reachable by URL by design.
