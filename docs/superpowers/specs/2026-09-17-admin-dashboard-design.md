# Admin console redesign — dashboard, module navigation and theme

Status: approved, ready for implementation plan
Date: 2026-09-17
Scope: frontend only. No backend changes, no new endpoints.

## Problem

`/admin` is a grid of six tiles that each link to a module. It tells an
administrator nothing about the state of the system, and navigation between
modules means returning to the console every time.

Two further problems come from the shared layout. `My tasks` and `Department`
appear in the administrator's navigation because the nav is filtered purely by
capability, and an admin holds `COMPLIANCE_VIEW_DEPARTMENT`. Both screens are
built for employees and department managers respectively.

## Goals

1. `/admin` becomes a dashboard of live widgets, each one a link into the module
   it summarises.
2. Administrators navigate module-wise from a persistent sidebar.
3. `My tasks` and `Department` no longer appear in administrator navigation.
4. The administrator area adopts a light, minimal theme with a lime accent.

## Non-goals

- No new backend endpoints. Every figure comes from an endpoint that already
  exists, so the change stays inside spec section 8.
- No charting library, no state library, no form library (CLAUDE.md rule 2).
- No change to the employee or manager experience.
- No change to existing admin page markup. Those pages inherit the new shell.

## Layout selection

`RoleLayout` chooses the shell from the signed-in user's role:

```
user.role === ADMIN  ->  <AdminLayout />   (sidebar shell)
otherwise            ->  <Layout />        (existing topbar + tabs)
```

Both render `<Outlet />`, so `App.jsx` changes in one place — the element on the
layout route — and every route keeps its current path.

Choosing by role rather than by route matters: the sidebar offers Policies,
Training, Compliance and Incidents, and those routes are shared with other
roles. Selecting by route would drop an administrator out of the sidebar the
moment they opened `/policies`.

### Why this hides My tasks and Department

`AdminLayout` carries its own navigation list, which does not contain those two
items. Nothing is revoked: the routes stay reachable by URL and the API keeps
enforcing access exactly as before. This is a navigation change only.

## Navigation

Sidebar items, each an icon-and-label pill, filtered through `can()` in the same
way the current tiles are — an affordance, never the control (NFR-SEC-03):

| Item        | Path                | Capability                     |
|-------------|---------------------|--------------------------------|
| Dashboard   | `/admin`            | `USER_MANAGE`                  |
| Users       | `/admin/users`      | `USER_MANAGE`                  |
| Policies    | `/policies`         | `POLICY_AUTHOR`                |
| Training    | `/training`         | `TRAINING_AUTHOR`              |
| Compliance  | `/compliance`       | `COMPLIANCE_VIEW_ORGANISATION` |
| Incidents   | `/incidents`        | `INCIDENT_TRIAGE`              |
| Audit log   | `/admin/audit-logs` | `AUDIT_VIEW`                   |

The header holds a `Welcome, {firstName}` title with a muted subtitle, and
groups notifications, password and sign-out to the right. `firstName` is the
first whitespace-separated word of `user.fullName`, falling back to the whole
string when there is no space.

Icons are a small inline SVG set defined in `components/AdminIcon.jsx`. No icon
package is added.

## Dashboard widgets

Every widget is a react-router `<Link>` wrapping the card, following the
`tile--link` pattern already in `AdminConsole.jsx`. Links rather than click
handlers on a `div`, so widgets stay keyboard-reachable.

| Widget                      | Source            | Navigates to        |
|-----------------------------|-------------------|---------------------|
| Open incidents (priority)   | `listIncidents()` | `/incidents`        |
| Compliance %                | `getDashboard()`  | `/compliance`       |
| Overdue items               | `getDashboard()`  | `/compliance`       |
| Active users                | `fetchUsers()`    | `/admin/users`      |
| Recent incidents by severity| `listIncidents()` | `/incidents`        |
| Compliance by department    | `getDashboard()`  | `/compliance`       |
| Recent activity             | `fetchAuditLogs()`| `/admin/audit-logs` |

### Widget definitions

Two of these need stating exactly, because the wording admits more than one
reading:

- **Open incidents** counts items whose status is `OPEN` or `IN_REVIEW` — every
  incident still requiring attention, not only those in the `OPEN` state. The
  widget is labelled "Open incidents" and its subtitle reads
  "open or in review" so the figure is not mistaken for a single-status count.
  This is the dashboard's priority widget; see below.
- **Active users** is read from `pagination.total` on
  `fetchUsers({ status: 'ACTIVE', limit: 1 })` — NOT tallied from the returned
  array. The list endpoint paginates at 25 by default and caps at 100, so
  counting the array would silently undercount any organisation with more than
  one page of staff. Requesting a single row and reading the server's own total
  is both exact and the cheapest possible request.

- **Recent incidents**, for the pie, means the 20 most recently reported,
  regardless of status: the returned items sorted by report date descending and
  the first 20 taken. The server sorts by severity rank, so this re-sort happens
  client-side. The heading reads "Recent incidents by severity" with a
  "latest 20" subtitle, so the figures are never mistaken for totals.

The pie and the "open incidents" figure therefore measure different things by
design — one is a recent sample across all statuses, the other a live count of
outstanding work. Their subtitles are what keep that distinction visible.

### The open-incidents priority widget

Open incidents are the one thing on this screen that may need acting on today,
so the widget is deliberately the loudest element rather than a peer of the
other three KPIs. It takes the first slot of the KPI row and spans two columns
on desktop, collapsing to full width on narrow screens.

It has two states, driven by `escalatedOpen` from the same `listIncidents()`
call. That field is the server's own UC-24 escalation count — HIGH or CRITICAL
incidents in `OPEN` or `IN_REVIEW`, computed for triagers — so the dashboard
inherits the existing definition of "needs attention" instead of inventing a
second one:

- **Escalated** (`escalatedOpen > 0`): the card takes the alert treatment —
  `#e0574f` accent, a warning glyph, and a second line reading
  "N high or critical need attention". This is what an administrator should see
  first on signing in.
- **Calm** (`escalatedOpen === 0`): ordinary surface with the accent used for
  the figure only. A queue with nothing escalated should not look like an
  emergency.

Both states carry the same wording distinction in text, so the escalation is
never signalled by colour alone (NFR-USE-03).

When the count is zero the widget says "No open incidents" rather than showing a
bare `0`.

`escalatedOpen` is `0` for any caller without `INCIDENT_TRIAGE`. Administrators
hold it, so the escalated state is reachable for them; the widget simply never
escalates for a role that could not act on it anyway.

### Data flow

Three requests are issued in parallel on mount — `getDashboard()`,
`listIncidents()` and `fetchUsers()` — plus `fetchAuditLogs()` for the activity
list. `getDashboard()` already returns
`{ summary: { total, completed, outstanding, overdue, compliancePercent }, departments[] }`,
which covers four of the seven widgets from a single call.

Each request resolves into its own piece of state, and each failure is caught
separately. One dead endpoint degrades the widgets that depend on it and leaves
the rest of the page working. A widget with no data yet shows a spinner; a
widget whose request failed shows a short inline message in place of its value.

### Severity pie

Inline SVG donut, drawn from `stroke-dasharray` arcs on concentric circles. The
centre holds the count of incidents charted. Counts are tallied client-side from
the 20 most recent items, as defined above.

```
CRITICAL  #e0574f        HIGH  #f0a23c
MEDIUM    #3fb8b0        LOW   #b9bec7
```

A legend beside the chart lists label and count for each severity, so the chart
never depends on colour alone to be read (NFR-USE-03). Slice fills carry no
text, so their contrast is not a text-contrast concern; every label sits on
white.

`listIncidents()` caps at 500 items, so the sample is drawn from that page
rather than from a server aggregate. Since only the newest 20 are charted, the
cap is reachable only once the system holds more than 500 incidents, and even
then it would have to be the *newest* 20 that fell outside the returned page —
which the server's severity ordering makes possible in principle. Worth knowing;
not worth a new endpoint at this scale, and adding one would deviate from spec
section 8.

When there are no incidents at all, the widget renders the existing
`EmptyState` component rather than an empty circle.

## Theme

A new `frontend/src/styles/admin.css`, scoped under `.admin-shell`. The global
tokens in `base.css` are not edited, so employee and manager screens are
unchanged.

```
--admin-canvas      #ebecee   page background
--admin-surface     #ffffff   cards, table surface
--admin-accent      #dff264   active nav pill, active page number
--admin-accent-ink  #1b2007   text on the accent
--admin-ink         #14161a   headings
--admin-ink-soft    #8a9099   secondary text
--admin-pill        999px     nav items, badges, pagination
--admin-radius      20px      cards
```

The file contains the shell and sidebar, the dashboard widget styles, and a
short set of scoped overrides for `.card`, `.table` and `.btn` under
`.admin-shell` so shared pages match the new surface treatment when an
administrator views them.

This gives the application two visual identities — a light lime administrator
area and the existing navy employee area. That is an accepted consequence of
scoping the theme to admin.

## Components

New, in `frontend/src/components/` per CLAUDE.md rule 4:

- `AdminLayout.jsx` — sidebar shell, header, `<Outlet />`
- `AdminSidebar.jsx` — the capability-filtered nav list
- `AdminIcon.jsx` — inline SVG icon set
- `StatCard.jsx` — one KPI widget: label, value, accent, destination, and an
  optional `tone` plus secondary line, which is what gives the open-incidents
  card its escalated state
- `SeverityPie.jsx` — the donut plus its legend
- `RoleLayout.jsx` — picks `AdminLayout` or `Layout` from the role

Rewritten:

- `pages/home/AdminConsole.jsx` — from a tile grid to the widget dashboard

Edited:

- `App.jsx` — layout route element becomes `RoleLayout`
- `styles/index.css` — imports `admin.css`

`Layout.jsx` is not modified. The tab bar it renders is simply never shown to an
administrator, because administrators get `AdminLayout`.

## Testing

The project has no frontend test suite, so verification is:

1. `npm run build` in `frontend/` completes with no errors.
2. Backend suite still passes, confirming nothing was disturbed server-side.
3. Manual check per role, signed in against seeded accounts:
   - admin sees the sidebar, the dashboard and no My tasks or Department item
   - every widget navigates to the page in the table above
   - the open-incidents widget shows its escalated state when the seed contains
     a HIGH or CRITICAL incident that is open or in review, and its calm state
     once those are resolved
   - employee and manager screens are visually unchanged
   - the severity legend reads correctly with colour ignored

## Risks

- **Two visual identities.** Accepted, noted above.
- **Shared pages under the admin shell.** `/policies` and `/training` are built
  for the old surface. The scoped `.card` and `.table` overrides are what keep
  them coherent; they need checking as an administrator, not only as an author.
- **Widget count means several requests on one screen.** Four parallel calls on
  mount is acceptable at this scale, and independent failure handling keeps a
  slow endpoint from blocking the page.
