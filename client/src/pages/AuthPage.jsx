import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Wordmark } from '../components/Layout.jsx';

const DEMO = { email: 'demo@tandem.dev', password: 'demo1234' };

// A small, static picture of the product: one card travels from "In progress" to "Done" once.
function BoardPreview() {
  return (
    <div className="preview" aria-hidden="true">
      <div className="preview-col">
        <b>To do</b>
        <span className="pv-card pv-high">Write release notes</span>
        <span className="pv-card pv-low">Review onboarding copy</span>
      </div>
      <div className="preview-col">
        <b>In progress</b>
        <span className="pv-card pv-med">Fix invite email</span>
        <span className="pv-card pv-med pv-travel">Ship dark mode</span>
      </div>
      <div className="preview-col">
        <b>Done</b>
        <span className="pv-card pv-low">Set up CI</span>
        <span className="pv-slot" />
      </div>
    </div>
  );
}

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function useDemo() {
    setError('');
    setBusy(true);
    try {
      await login(DEMO.email, DEMO.password);
      navigate('/');
    } catch (err) {
      setError(err.status === 401 ? 'The demo account has not been set up on this server yet.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-story">
        <Wordmark light />
        <div>
          <h1>Plan together. See every change the moment it happens.</h1>
          <p>
            Shared boards for small teams. Owners run the workspace, members move the work, and everyone sees updates
            live.
          </p>
        </div>
        <BoardPreview />
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h2>{isRegister ? 'Create your account' : 'Sign in'}</h2>

          {isRegister && (
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={80} />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 8 : undefined}
              required
            />
            {isRegister && <small>At least 8 characters.</small>}
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>

          {!isRegister && (
            <button type="button" className="btn btn-ghost btn-block" onClick={useDemo} disabled={busy}>
              Explore with the demo account
            </button>
          )}

          <p className="switch">
            {isRegister ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <>
                New to Tandem? <Link to="/register">Create an account</Link>
              </>
            )}
          </p>
        </form>
      </section>
    </div>
  );
}
