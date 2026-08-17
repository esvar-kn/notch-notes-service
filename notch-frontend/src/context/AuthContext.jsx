import { createContext, useReducer, useContext, useEffect } from 'react';
import { authReducer, AUTH_ACTIONS, getInitialAuthState } from './authReducer';

const initialState = typeof window !== 'undefined' ? getInitialAuthState(localStorage) : {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

// Create Context
export const AuthContext = createContext(initialState);

// AuthProvider Component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Synchronize 401 unauthorized interceptor events with React Auth state
  useEffect(() => {
    const handleUnauthorized = () => {
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  // Helper action dispatchers
  const loginSuccess = (userData) => {
    dispatch({
      type: AUTH_ACTIONS.LOGIN_SUCCESS,
      payload: userData,
    });
  };

  const logout = () => {
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  };

  const setAuthError = (errorMsg) => {
    dispatch({
      type: AUTH_ACTIONS.AUTH_ERROR,
      payload: errorMsg,
    });
  };

  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  const setLoading = (isLoading) => {
    dispatch({
      type: AUTH_ACTIONS.SET_LOADING,
      payload: isLoading,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        loading: state.loading,
        error: state.error,
        dispatch,
        loginSuccess,
        logout,
        setAuthError,
        clearError,
        setLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom Hook for using AuthContext
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
