import { useEffect, useState } from 'react';
import { listUsers, updateUserRole, updateUserStatus } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import Alert from '../../components/Alert';
import { ALL_ROLES, ROLE_LABELS } from '../../constants';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load users.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRoleChange = async (id, role) => {
    try {
      await updateUserRole(id, role);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update role.');
    }
  };

  const handleStatusToggle = async (id, isActive) => {
    try {
      await updateUserStatus(id, !isActive);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.');
    }
  };

  if (loading) return <Loader label="Loading users…" />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Manage Users</h1>
        <p className="muted">Promote trusted staff to admin, or deactivate accounts that no longer need access.</p>
      </div>

      <Alert type="error">{error}</Alert>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Employee ID</th>
              <th>Department</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.employeeId}</td>
                <td>{ROLE_LABELS[u.department] || u.department}</td>
                <td>
                  <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}>
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <Badge tone={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={u.id === currentUser.id}
                    onClick={() => handleStatusToggle(u.id, u.isActive)}
                  >
                    {u.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
