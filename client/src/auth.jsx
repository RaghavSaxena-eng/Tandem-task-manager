import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => tokenStore.get());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  // Restore the session from a saved token.
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api('/api/auth/me')
      .then((data) => !cancelled && setUser(data.user))
      .catch((err) => {
        if (cancelled) return;
        // Only drop the token when the server rejected it, not on a network blip.
        if (err.status === 401) {
          tokenStore.clear();
          setToken(null);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const finish = useCallback((data) => {
    tokenStore.set(data.token);
    setUser(data.user);
    setToken(data.token);
  }, []);

  const login = useCallback(
    async (email, password) => finish(await api('/api/auth/login', { method: 'POST', body: { email, password } })),
    [finish]
  );

  const register = useCallback(
    async (name, email, password) =>
      finish(await api('/api/auth/register', { method: 'POST', body: { name, email, password } })),
    [finish]
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
