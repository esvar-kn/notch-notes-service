import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import './SignupForm.css';


export const SignupForm = ({ onSuccess, switchToLogin }) => {
  const { loginSuccess } = useAuth();
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
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

    const name = formData.name.trim();
    const email = formData.email.trim();
    const password = formData.password;

    if (!name || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (name.length < 2) {
      setError('Name must be at least 2 characters long.');
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
      const res = await authService.register(formData);

      if (res.success) {
        // Automatically perform login after registration for seamless UX
        try {
          const loginRes = await authService.login({
            email: formData.email,
            password: formData.password,
          });

          if (loginRes.success && loginRes.data.token) {
            loginSuccess({
              user: { name: loginRes.data.name, email: loginRes.data.email },
              token: loginRes.data.token,
            });
            if (onSuccess) onSuccess();
          } else {
            if (switchToLogin) switchToLogin();
          }
        } catch {
          // If auto-login fails, switch to login form
          if (switchToLogin) switchToLogin();
        }
      } else {
        setError(res.message || 'Registration failed.');
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err.message || 'An error occurred during registration.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-form-container">
      <div className="auth-header">
        <h2>Create an Account</h2>
        <p>Start organizing and managing your notes effortlessly</p>
      </div>

      {error && <div className="auth-error-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="signup-name">Full Name</label>
          <input
            id="signup-name"
            type="text"
            name="name"
            placeholder="John Doe"
            value={formData.name}
            onChange={handleChange}
            required
            autoComplete="name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="signup-email">Email Address</label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password">Password</label>
          <div className="password-input-wrapper">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="At least 8 characters"
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
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
          {isSubmitting ? <><span className="btn-spinner"></span>Creating Account...</> : 'Create Account'}
        </button>
      </form>

      {switchToLogin && (
        <p className="auth-switch-text">
          Already have an account?{' '}
          <button type="button" className="auth-switch-btn" onClick={switchToLogin}>
            Sign in
          </button>
        </p>
      )}
    </div>
  );
};
