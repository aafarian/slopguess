/**
 * Login page — email or username + password form.
 * Redirects to home on success.
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiRequestError } from '../services/api';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!loginId.trim()) {
      errs.login = 'Email or username is required';
    }
    if (!password) {
      errs.password = 'Password is required';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      await login(loginId, password);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.details) {
          const mapped: Record<string, string> = {};
          for (const d of err.details) {
            mapped[d.field] = d.message;
          }
          setFieldErrors(mapped);
        }
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Login</h1>
        <p className="auth-subtitle">Welcome back to the slop.</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login">Email or Username</label>
            <input
              id="login"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="you@example.com or username"
              autoComplete="username"
              className={fieldErrors.login ? 'input-error' : ''}
            />
            {fieldErrors.login && (
              <span className="field-error">{fieldErrors.login}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              className={fieldErrors.password ? 'input-error' : ''}
            />
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
