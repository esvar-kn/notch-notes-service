import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import './LoginForm.css';


export const LoginForm = ({ onSuccess, switchToSignup }) => {
  const { loginSuccess } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const email = formData.email.trim();
    const password = formData.password;

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await authService.login(formData);
      if (res.success && res.data.token) {
        loginSuccess({
          user: { name: res.data.name, email: res.data.email },
          token: res.data.token,
        });
        if (onSuccess) onSuccess();
      } else {
        setError(res.message || 'Login failed. Please check your credentials.');
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err.message || 'An error occurred during login.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-form-container">
      <div className="auth-header">
        <h2>Welcome Back</h2>
        <p>Sign in to access your saved notes</p>
      </div>

      {error && <div className="auth-error-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="login-email">Email Address</label>
          <input
            id="login-email"
            type="email"
            name="email"
            placeholder="name@example.com"
            value={formData.email}
            onChange={handleChange}
            required
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label htmlFor="login-password">Password</label>
          <div className="password-input-wrapper">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="toggle-password-btn"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
          {isSubmitting ? <><span className="btn-spinner"></span>Signing in...</> : 'Sign In'}
        </button>
      </form>

      {switchToSignup && (
        <p className="auth-switch-text">
          Don't have an account?{' '}
          <button type="button" className="auth-switch-btn" onClick={switchToSignup}>
            Create one
          </button>
        </p>
      )}
    </div>
  );
};
