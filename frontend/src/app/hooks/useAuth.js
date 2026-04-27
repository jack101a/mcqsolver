import { useCallback } from 'react';

export function useAuth() {
  const logout = useCallback(async () => {
    try {
      await fetch("/admin/logout", { method: "POST", credentials: "include" });
    } finally {
      window.location.assign("/admin/login");
    }
  }, []);

  return { logout };
}
