import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../constants';

const NotFound = () => {
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="page page--centered">
      <div className="card">
        <h1>Page not found</h1>
        <p className="muted">That address does not exist.</p>
        <Link to={isAuthenticated ? homePathFor(user) : '/login'} className="btn btn--primary">
          {isAuthenticated ? 'Back to my home page' : 'Go to sign in'}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
