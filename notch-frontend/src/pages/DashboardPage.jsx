import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './DashboardPage.css';

export const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="dashboard-page-wrapper">
      <div className="auth-card dashboard-card">
        <div className="auth-header">
          <h2>Protected Notes Dashboard</h2>
          <p>Welcome back, {user?.name || 'User'}!</p>
        </div>

        <div className="user-badge dashboard-user-badge">
          <div className="avatar">{user?.name ? user.name[0].toUpperCase() : 'U'}</div>
          <div>
            <h3>{user?.name}</h3>
            <p>{user?.email}</p>
          </div>
        </div>

        <div className="dashboard-info-box">
          <span className="status-indicator"></span>
          <span>Authenticated Session Active</span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/notes')}
          className="btn-view-notes"
        >
          View & Create Notes
        </button>

        <button onClick={logout} className="auth-logout-btn">
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default DashboardPage;
