import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Navbar } from './Navbar';
import './ProtectedRoute.css';

/**
 * ProtectedRoute component that checks for an active authentication token.
 * Redirects unauthenticated users to /login while preserving intended destination.
 */
export const ProtectedRoute = ({ children, redirectTo = '/login' }) => {
  const { token, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // If auth status is currently being loaded/verified, show loading indicator
  if (loading) {
    return (
      <div className="auth-loading-spinner">
        <div className="status-indicator loading-indicator"></div>
      </div>
    );
  }

  // Redirect to /login if there is no token or user is not authenticated
  if (!token || !isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Render children if provided, or nested Outlet routes with Navbar
  return (
    <>
      <Navbar />
      {children ? children : <Outlet />}
    </>
  );
};

export default ProtectedRoute;

