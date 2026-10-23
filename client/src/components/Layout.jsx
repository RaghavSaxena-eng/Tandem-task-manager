import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Avatar from './Avatar.jsx';

export function Wordmark({ light = false }) {
  return (
    <span className={`wordmark ${light ? 'wordmark-light' : ''}`}>
      <span className="wordmark-rings" aria-hidden="true">
        <i />
        <i />
      </span>
      Tandem
    </span>
  );
}

/**
 * App chrome. `trail` is a list of { label, to } links shown after the logo,
 * `live` (true/false/undefined) shows the real-time connection status.
 */
export default function Layout({ trail = [], live, children }) {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <nav className="topbar-nav" aria-label="Breadcrumb">
          <Link to="/" className="topbar-home" aria-label="All workspaces">
            <Wordmark />
          </Link>
          {trail.map((item, i) => (
            <span key={i} className="crumb">
              <span className="crumb-sep" aria-hidden="true">/</span>
              {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            </span>
          ))}
        </nav>
        <div className="topbar-right">
          {live !== undefined && (
            <span className={`live ${live ? 'live-on' : ''}`} title={live ? 'Changes appear instantly' : 'Reconnecting…'}>
              <span className="live-dot" />
              {live ? 'Live' : 'Offline'}
            </span>
          )}
          {user && (
            <>
              <span className="who">
                <Avatar name={user.name} />
                <span className="who-name">{user.name}</span>
              </span>
              <button className="btn btn-quiet" onClick={logout}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
