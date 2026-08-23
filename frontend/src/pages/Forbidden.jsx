import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../constants';

const Forbidden = () => {
  const { user } = useAuth();

  return (
    <div className="page page--centered">
      <div className="card">
        <h1>Not available to your role</h1>
        <p className="muted">
          Your account does not have permission to open this page. If you think it should, ask your
          administrator.
        </p>
        <Link to={homePathFor(user)} className="btn btn--primary">
          Back to my home page
        </Link>
      </div>
    </div>
  );
};

export default Forbidden;
