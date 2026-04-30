import { useLocation } from "wouter";
import {
  Home,
  MessageCircle,
  ShoppingBag,
  User as UserIcon,
  LayoutGrid,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";

export type BottomNavActive = "beranda" | "dashboard" | "jadwal" | "chat" | "pesanan" | "akun";

interface NavItem {
  id: BottomNavActive;
  icon: LucideIcon;
  label: string;
  path: string;
}

export function BottomNav({ active }: { active: BottomNavActive }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isDriver = user?.role === "driver";

  const items: NavItem[] = isDriver
    ? [
        { id: "dashboard", icon: LayoutGrid, label: "Dashboard", path: "/dashboard-driver" },
        { id: "jadwal", icon: CalendarDays, label: "Jadwal", path: "/jadwal" },
        { id: "chat", icon: MessageCircle, label: "Chat", path: "/chat" },
        { id: "pesanan", icon: ShoppingBag, label: "Pesanan", path: "/pesanan" },
        { id: "akun", icon: UserIcon, label: "Akun", path: "/profil" },
      ]
    : [
        { id: "beranda", icon: Home, label: "Beranda", path: "/dashboard-penumpang" },
        { id: "chat", icon: MessageCircle, label: "Chat", path: "/chat" },
        { id: "pesanan", icon: ShoppingBag, label: "Pesanan", path: "/pesanan" },
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
          return (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => setLocation(item.path)}
              className="flex flex-col items-center gap-1 px-3 py-1"
            >
              <Icon
                className="w-5 h-5"
                style={{ color: isActive ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))" }}
              />
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
