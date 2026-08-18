import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page page-narrow" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <h1>404</h1>
      <p className="muted">The page you're looking for doesn't exist.</p>
      <Link className="btn btn-primary" to="/">
        Back to dashboard
      </Link>
    </div>
  );
}
