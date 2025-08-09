import { useEffect, useState } from 'react';

export type CurrentUser = { role: 'admin' | 'agent'; username: string; displayName: string } | null;

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          setUser(null);
        } else {
          const data = await res.json();
          if (!cancelled) setUser({ role: data.role, username: data.username, displayName: data.displayName });
        }
      } catch (e) {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { user, loading };
} 