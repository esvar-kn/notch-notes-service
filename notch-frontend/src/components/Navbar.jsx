import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export const Navbar = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) return null;

  const handleBrandClick = () => {
    navigate('/dashboard');
  };

  return (
    <header className="navbar">
      <div className="navbar-brand" onClick={handleBrandClick}>
        <img src="/logo.png" alt="Notch logo" className="navbar-brand-icon" width="32" height="32" />
        <span>Notch</span>
      </div>

      <nav className="navbar-links">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/notes"
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          My Notes
        </NavLink>
      </nav>

      <div className="navbar-user-section">
        <div className="nav-user-info">
          <div className="nav-avatar">{user?.name ? user.name[0].toUpperCase() : 'U'}</div>
          <span className="nav-username">{user?.name || 'User'}</span>
        </div>
        <button type="button" onClick={logout} className="btn-nav-logout">
          Sign Out
        </button>
      </div>
    </header>
  );
};

export default Navbar;
