// Action Types
export const AUTH_ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  AUTH_ERROR: 'AUTH_ERROR',
  SET_LOADING: 'SET_LOADING',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

// Initial State Helper
export const getInitialAuthState = (storage = localStorage) => {
  const storedToken = storage ? storage.getItem('token') : null;
  const storedUser = storage ? storage.getItem('user') : null;

  return {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken || null,
    isAuthenticated: Boolean(storedToken),
    loading: false,
    error: null,
  };
};

// Reducer Function
export const authReducer = (state, action, storage = localStorage) => {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload !== undefined ? action.payload : true,
      };

    case AUTH_ACTIONS.LOGIN_SUCCESS: {
      const { user, token } = action.payload;
      if (storage) {
        if (token) storage.setItem('token', token);
        if (user) storage.setItem('user', JSON.stringify(user));
      }
      return {
        ...state,
        user,
        token,
        isAuthenticated: true,
        loading: false,
        error: null,
      };
    }

    case AUTH_ACTIONS.LOGOUT:
    case AUTH_ACTIONS.AUTH_ERROR:
      if (storage) {
        storage.removeItem('token');
        storage.removeItem('user');
      }
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        error: action.payload || null,
      };

    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
};
