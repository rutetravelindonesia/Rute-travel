import { useLocation } from "wouter";
import {
  Home,
  MessageCircle,
  ShoppingBag,
  User as UserIcon,
  LayoutGrid,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useNotifications } from "@/contexts/notifications";

export type BottomNavActive = "beranda" | "dashboard" | "jadwal" | "chat" | "pesanan" | "akun" | "notifikasi";

interface NavItem {
  id: BottomNavActive;
  icon: LucideIcon;
  label: string;
  path: string;
}

export function BottomNav({ active }: { active: BottomNavActive }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const isDriver = user?.role === "driver";

  const items: NavItem[] = isDriver
    ? [
        { id: "dashboard", icon: LayoutGrid, label: "Dashboard", path: "/dashboard-driver" },
        { id: "chat", icon: MessageCircle, label: "Chat", path: "/chat" },
        { id: "pesanan", icon: ShoppingBag, label: "Pesanan", path: "/pesanan" },
        { id: "notifikasi", icon: Bell, label: "Notifikasi", path: "/notifikasi" },
        { id: "akun", icon: UserIcon, label: "Akun", path: "/profil" },
      ]
    : [
        { id: "beranda", icon: Home, label: "Beranda", path: "/dashboard-penumpang" },
        { id: "chat", icon: MessageCircle, label: "Chat", path: "/chat" },
        { id: "pesanan", icon: ShoppingBag, label: "Pesanan", path: "/pesanan" },
        { id: "notifikasi", icon: Bell, label: "Notifikasi", path: "/notifikasi" },
        { id: "akun", icon: UserIcon, label: "Akun", path: "/profil" },
      ];

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border z-30"
      style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center justify-around px-2 py-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          const showBadge = item.id === "notifikasi" && unreadCount > 0;
          return (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => setLocation(item.path)}
              className="flex flex-col items-center gap-1 px-3 py-1 relative"
            >
              <div className="relative">
                <Icon
                  className="w-5 h-5"
                  style={{ color: isActive ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))" }}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] font-semibold"
                style={{ color: isActive ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
