import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from '../../components/Alert';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { useAuth } from '../../auth/AuthContext';
import { fetchUsers, updateUser } from '../../api/users';
import { DEPARTMENT_LABELS, ROLE_LABELS, USER_STATUS_LABELS } from '../../constants';
import { formatDateTime } from '../../utils/format';

// The roster (spec section 8.2), with the two things an admin does most often
// available from the row itself: open an account to edit it, and switch access
// on or off.
//
// The toggle acts immediately rather than behind a confirmation, because it is
// symmetrical - flipping it back restores access, and the row shows the result
// straight away. Everything genuinely one-way (resetting a password) stays on
// the detail screen.

const BLANK_FILTERS = { department: '', role: '', status: '', q: '' };

// Inline rather than from an icon library: this project has no icon dependency
// and one pencil does not justify adding one. `aria-hidden` because the button
// around it carries the accessible name.
const PencilIcon = () => (
  <svg
    className="icon-btn__glyph"
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M11.5 1.5a1.414 1.414 0 0 1 2 2L5 12l-2.5.5.5-2.5 8.5-8.5Z" />
    <path d="M10.5 2.5l2 2" />
  </svg>
);

// A locked account is not a third status - it is an ACTIVE account that cannot
// currently sign in - but it is the answer to "why can this person not log in",
// so it wins the badge when both apply.
const statusBadge = (user) => {
  if (user.isLocked) return { tone: 'warning', text: 'Locked' };
  if (user.status === 'INACTIVE') return { tone: 'neutral', text: 'Inactive' };
  return { tone: 'ok', text: 'Active' };
};

const UserList = () => {
  const { user: currentUser } = useAuth();

  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Bumped by "Try again" to re-run the effect without changing the query.
  const [reloadKey, setReloadKey] = useState(0);
  // The row whose toggle is mid-flight, and the last failure from one. Kept as
  // ids rather than booleans so two rows cannot appear busy at once.
  const [pendingId, setPendingId] = useState(null);
  const [rowError, setRowError] = useState(null);

  const retry = () => setReloadKey((current) => current + 1);

  // Patches the one row in place instead of refetching the page: a refetch
  // would re-sort and re-filter, so deactivating someone while the Status
  // filter is set to Active would make the row vanish under the cursor.
  const toggleStatus = async (user) => {
    const status = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setPendingId(user.id);
    setRowError(null);

    try {
      const result = await updateUser(user.id, { status });

      setData((current) => ({
        ...current,
        users: current.users.map((row) => (row.id === user.id ? result.user : row)),
      }));
    } catch (toggleError) {
      setRowError({ name: user.fullName, message: toggleError.message });
    } finally {
      setPendingId(null);
    }
  };

  // Any change to what is being asked for invalidates the current page number:
  // staying on page 3 of a narrower result set shows an empty table.
  const setFilter = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }));
    setPage(1);
  };

  // Typing in the search box fires a request per keystroke, so responses can
  // arrive out of order. `active` discards anything that comes back after the
  // query has moved on - without it, a slow response to "ban" can overwrite the
  // results for "bandara".
  useEffect(() => {
    let active = true;
    setError(null);

    // Empty strings are omitted rather than sent: the query schema is strict
    // about enum values and `department=''` is not one of them.
    const params = Object.fromEntries(
      Object.entries({ ...filters, page }).filter(([, value]) => value !== '')
    );

    fetchUsers(params)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });

    return () => {
      active = false;
    };
  }, [filters, page, reloadKey]);

  const header = (
    <header className="page__header">
      <h1>User accounts</h1>
      <p>Create accounts, move people between departments, and end access when someone leaves.</p>
    </header>
  );

  if (error) {
    return (
      <div className="page">
        {header}
        <Alert tone="error" title="Could not load the user list">
          {error}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={retry}>
            Try again
          </button>
        </Alert>
      </div>
    );
  }

  const { users, pagination } = data || {};

  return (
    <div className="page">
      {header}

      <div className="list-toolbar">
        <Link to="/admin/users/new" className="btn btn--primary btn--sm">
          + New user
        </Link>
      </div>

      <section className="card">
        <div className="filters">
          <label className="field" htmlFor="filter-q">
            <span className="field__label">Search</span>
            <input
              id="filter-q"
              className="field__input"
              value={filters.q}
              onChange={setFilter('q')}
              placeholder="Name, employee ID or email"
            />
          </label>

          <label className="field" htmlFor="filter-department">
            <span className="field__label">Department</span>
            <select
              id="filter-department"
              className="field__input"
              value={filters.department}
              onChange={setFilter('department')}
            >
              <option value="">All departments</option>
              {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field" htmlFor="filter-role">
            <span className="field__label">Role</span>
            <select
              id="filter-role"
              className="field__input"
              value={filters.role}
              onChange={setFilter('role')}
            >
              <option value="">All roles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field" htmlFor="filter-status">
            <span className="field__label">Status</span>
            <select
              id="filter-status"
              className="field__input"
              value={filters.status}
              onChange={setFilter('status')}
            >
              <option value="">Active and inactive</option>
              {Object.entries(USER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!data && <Spinner label="Loading accounts…" />}

        {data && users.length === 0 && (
          <p className="muted">
            No accounts match those filters.{' '}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setFilters(BLANK_FILTERS);
                setPage(1);
              }}
            >
              Clear filters
            </button>
          </p>
        )}

        {data && users.length > 0 && (
          <>
            {rowError && (
              <Alert tone="error" title={`Could not update ${rowError.name}`}>
                {rowError.message}
              </Alert>
            )}

            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Department</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last sign-in</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const badge = statusBadge(user);
                    const isActive = user.status === 'ACTIVE';
                    // The API refuses an admin deactivating themselves, so the
                    // control is disabled rather than offered and then failed
                    // (UC-05).
                    const isSelf = currentUser?.id === user.id;
                    const busy = pendingId === user.id;

                    return (
                      <tr key={user.id}>
                        <td>
                          <Link to={`/admin/users/${user.id}`}>{user.fullName}</Link>
                          <small className="table__sub">
                            {user.employeeId} · {user.email}
                          </small>
                        </td>
                        <td>{DEPARTMENT_LABELS[user.department] || user.department}</td>
                        <td>{ROLE_LABELS[user.role] || user.role}</td>
                        <td>
                          <Badge tone={badge.tone}>{badge.text}</Badge>
                          {user.mustChangePassword && (
                            <small className="table__sub">Temporary password</small>
                          )}
                        </td>
                        <td>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</td>
                        <td>
                          <div className="row-actions">
                            <Link
                              to={`/admin/users/${user.id}`}
                              className="icon-btn"
                              aria-label={`Edit ${user.fullName}`}
                              title={`Edit ${user.fullName}`}
                            >
                              <PencilIcon />
                            </Link>

                            {/* role="switch" rather than a checkbox: this is an
                                immediate on/off action, not a form field that
                                gets submitted later. */}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isActive}
                              aria-label={`${isActive ? 'Deactivate' : 'Reactivate'} ${user.fullName}`}
                              title={
                                isSelf
                                  ? 'You cannot deactivate your own account'
                                  : isActive
                                    ? 'Active — click to end access'
                                    : 'Inactive — click to restore access'
                              }
                              className={`switch${isActive ? ' switch--on' : ''}`}
                              disabled={isSelf || busy}
                              onClick={() => toggleStatus(user)}
                            >
                              <span className="switch__track">
                                <span className="switch__thumb" />
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="table-actions">
              <span className="muted">
                {pagination.total} account{pagination.total === 1 ? '' : 's'}
              </span>
              {pagination.pages > 1 && (
                <span className="table-actions__pager">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Previous
                  </button>
                  <span className="muted">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={page >= pagination.pages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default UserList;
