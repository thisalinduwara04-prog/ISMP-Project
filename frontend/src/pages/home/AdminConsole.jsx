import { useEffect, useState } from 'react';

import { getDashboard } from '../../api/compliance';
import { listIncidents } from '../../api/incidents';
import { fetchUsers } from '../../api/users';
import { fetchAuditLogs } from '../../api/audit';
import ActivityList from '../../components/ActivityList';
import DepartmentBars from '../../components/DepartmentBars';
import SeverityPie from '../../components/SeverityPie';
import StatCard from '../../components/StatCard';
import Widget from '../../components/Widget';

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
    <div className="widget-grid">
      <StatCard
        label="Open incidents"
        icon="incidents"
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
        icon="shield"
        value={summary ? `${summary.compliancePercent}%` : null}
        sub="across the organisation"
        to="/compliance"
        loading={!compliance.data && !compliance.error}
        error={compliance.error}
      />

      <StatCard
        label="Overdue items"
        icon="clock"
        value={summary ? summary.overdue : null}
        sub="past their due date"
        to="/compliance"
        tone={summary?.overdue > 0 ? 'alert' : 'default'}
        loading={!compliance.data && !compliance.error}
        error={compliance.error}
      />

      <Widget
        title="Recent incidents by severity"
        subtitle={`latest ${RECENT_LIMIT}`}
        to="/incidents"
        loading={!incidents.data && !incidents.error}
        loadingLabel="Loading incidents…"
        error={incidents.error}
      >
        <SeverityPie counts={tallyBySeverity(recent)} />
      </Widget>

      <Widget
        title="Compliance by department"
        subtitle="completed assignments"
        to="/compliance"
        loading={!compliance.data && !compliance.error}
        loadingLabel="Loading compliance…"
        error={compliance.error}
      >
        <DepartmentBars departments={compliance.data?.departments || []} />
      </Widget>

      <StatCard
        label="Active users"
        icon="users"
        value={activeUsers.data ? activeUsers.data.pagination.total : null}
        sub="accounts in use"
        to="/admin/users"
        loading={!activeUsers.data && !activeUsers.error}
        error={activeUsers.error}
      />

      <Widget
        title="Recent activity"
        subtitle="latest security events"
        to="/admin/audit-logs"
        span="three"
        loading={!activity.data && !activity.error}
        loadingLabel="Loading activity…"
        error={activity.error}
      >
        <ActivityList entries={activity.data?.entries || []} />
      </Widget>
    </div>
  );
};

export default AdminConsole;
