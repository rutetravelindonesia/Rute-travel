import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, CheckCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useNotifications } from "@/contexts/notifications";

interface Notif {
  id: number;
  type: string;
  title: string;
  body: string | null;
  ref_type: string | null;
  ref_id: number | null;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  return `${days} hari lalu`;
}

function notifIcon(type: string) {
  const map: Record<string, string> = {
    new_booking: "🛎️",
    cancel_booking: "❌",
    booking_cancelled: "❌",
    pickup_confirmed: "✅",
    trip_progress: "🚗",
    trip_completed: "🏁",
    booking_verified: "🎉",
    booking_rejected: "❌",
    new_payment_proof: "💳",
    mitra_approved: "✅",
    payment_confirmed: "💰",
    all_payments_confirmed: "✅",
  };
  return map[type] ?? "🔔";
}

export default function NotifikasiPage() {
  const [, setLocation] = useLocation();
  const { token, user } = useAuth();
  const { refresh } = useNotifications();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  async function load() {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/notifications`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) setNotifs(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    if (!token) return;
    setMarkingAll(true);
    await fetch(`${apiBase}/notifications/read-all`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    refresh();
    setMarkingAll(false);
  }

  async function markRead(id: number) {
    if (!token) return;
    await fetch(`${apiBase}/notifications/${id}/read`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    refresh();
  }

  function handleClick(n: Notif) {
    markRead(n.id);
    if (n.type === "new_payment_proof") {
      setLocation("/admin/payments");
    } else if (n.ref_type === "schedule_booking" && n.ref_id) {
      setLocation(`/booking/${n.ref_id}/etiket`);
    } else if (n.ref_type === "carter_booking" && n.ref_id) {
      setLocation(`/carter-booking/${n.ref_id}/etiket`);
    } else if (n.ref_type === "schedule" && n.ref_id) {
      if (user?.role === "driver") {
        setLocation(`/trip/${n.ref_id}/detail`);
      } else {
        setLocation("/pesanan");
      }
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  const isDriver = user?.role === "driver";
  const unread = notifs.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-background pb-8">
      <div
        className="sticky top-0 z-20 px-4 pt-10 pb-4"
        style={{ background: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation(isDriver ? "/dashboard-driver" : "/dashboard-penumpang")}
              className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Notifikasi</h1>
              {unread > 0 && (
                <p className="text-[11px] text-muted-foreground">{unread} belum dibaca</p>
              )}
            </div>
          </div>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 disabled:opacity-50"
            >
              {markingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
              Tandai semua dibaca
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
            <Bell className="w-10 h-10 opacity-30" />
            <p className="text-sm">Belum ada notifikasi</p>
          </div>
        ) : (
          notifs.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left rounded-2xl p-4 border transition-colors ${
                n.is_read
                  ? "bg-card border-border"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{notifIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug ${n.is_read ? "font-medium text-foreground" : "font-bold text-foreground"}`}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  {n.body && (
                    <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 mt-1.5">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
