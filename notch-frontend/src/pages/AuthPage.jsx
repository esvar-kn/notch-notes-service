import { useState } from 'react';
import { LoginForm } from '../components/LoginForm';
import { SignupForm } from '../components/SignupForm';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';


export const AuthPage = ({ initialTab = 'login' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { user, isAuthenticated, logout } = useAuth();

  if (isAuthenticated && user) {
    return (
      <div className="auth-card authenticated-card">
        <div className="user-badge">
          <div className="avatar">{user.name ? user.name[0].toUpperCase() : 'U'}</div>
          <div>
            <h3>{user.name}</h3>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="auth-status-box">
          <span className="status-indicator"></span>
          <span>Logged in successfully</span>
        </div>
        <button onClick={logout} className="auth-logout-btn">
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card">
        <div className="auth-tabs">
          <button
            className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
          >
            Sign In
          </button>
          <button
            className={`tab-btn ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => setActiveTab('signup')}
          >
            Register
          </button>
        </div>

        {activeTab === 'login' ? (
          <LoginForm switchToSignup={() => setActiveTab('signup')} />
        ) : (
          <SignupForm switchToLogin={() => setActiveTab('login')} />
        )}
      </div>
    </div>
  );
};
