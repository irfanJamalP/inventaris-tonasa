import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getToken, getUser } from '../lib/auth';

/**
 * useAuth hook - Protects pages by checking JWT token.
 * @param {string|null} requiredRole - If set, redirects to /dashboard if user doesn't have this role.
 * @returns {{ token, user, loading }}
 */
export default function useAuth(requiredRole = null) {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    const u = getUser();
    if (!t || !u) {
      router.replace('/login');
      return;
    }
    if (requiredRole) {
      const isAdminRole = requiredRole === 'admin' && (u.role === 'admin' || u.role === 'admin_utama');
      const isExactRole = u.role === requiredRole;
      if (!isAdminRole && !isExactRole) {
        router.replace('/dashboard');
        return;
      }
    }
    setToken(t);
    setUser(u);
    setLoading(false);
  }, []);

  return { token, user, loading };
}
