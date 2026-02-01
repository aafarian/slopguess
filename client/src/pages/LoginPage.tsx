/**
 * Login page — email + password form.
 * Redirects to home on success.
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiRequestError } from '../services/api';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Invalid email format';
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
      await login(email, password);
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
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className={fieldErrors.email ? 'input-error' : ''}
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email}</span>
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
