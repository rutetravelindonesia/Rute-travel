import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth";

interface NotificationCtx {
  unreadCount: number;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationCtx>({ unreadCount: 0, refresh: () => {} });

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchCount() {
    if (!token || !user || user.role === "admin") return;
    try {
      const res = await fetch(`${apiBase}/notifications/unread-count`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const j = await res.json();
        setUnreadCount(j.count ?? 0);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!token || !user || user.role === "admin") {
      setUnreadCount(0);
      return;
    }
    fetchCount();
    intervalRef.current = setInterval(fetchCount, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, user?.id]);

  return (
    <NotificationContext.Provider value={{ unreadCount, refresh: fetchCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
