import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { LoginRequest, RegisterRequest, User } from '../../shared/types.ts';
import * as api from './api.ts';
import { useT } from './i18n.tsx';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Any failure (401, server down) means "not logged in"; the login form surfaces real errors.
    api.me().then(setUser, () => setUser(null)).finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      login: async (body) => setUser(await api.login(body)),
      register: async (body) => setUser(await api.register(body)),
      logout: async () => {
        await api.logout();
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

/** Route guard: sends guests to /login, remembering where they were headed. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const t = useT();
  if (loading) return <p role="status">{t('auth.loading')}</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
