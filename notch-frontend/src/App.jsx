import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotesListPage } from './pages/NotesListPage';
import { NoteDetailPage } from './pages/NoteDetailPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import './services/socket';

function App() {
  const { isAuthenticated, token } = useAuth();
  const hasToken = Boolean(token || isAuthenticated);

  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route
        path="/login"
        element={hasToken ? <Navigate to="/dashboard" replace /> : <AuthPage initialTab="login" />}
      />
      <Route
        path="/signup"
        element={hasToken ? <Navigate to="/dashboard" replace /> : <AuthPage initialTab="signup" />}
      />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute redirectTo="/login" />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/notes" element={<NotesListPage />} />
        <Route path="/notes/:id" element={<NoteDetailPage />} />
      </Route>

      {/* Root & Catch-all redirection */}
      <Route
        path="/"
        element={<Navigate to={hasToken ? "/dashboard" : "/login"} replace />}
      />
      <Route
        path="*"
        element={<Navigate to={hasToken ? "/dashboard" : "/login"} replace />}
      />
    </Routes>
  );
}

export default App;
