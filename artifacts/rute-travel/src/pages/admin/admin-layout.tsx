import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Users, CalendarDays, Ticket, Car, Star,
  BarChart3, MapPin, Megaphone, DollarSign, ClipboardList,
  LogOut, Menu, X, ShoppingBag, CheckCircle, UserCheck
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useLogout } from "@workspace/api-client-react";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Manajemen User", icon: Users },
  { href: "/admin/verifikasi-mitra", label: "Verifikasi Mitra", icon: UserCheck, pendingBadge: true },
  { href: "/admin/schedules", label: "Jadwal", icon: CalendarDays },
  { href: "/admin/bookings", label: "Booking Reguler", icon: Ticket },
  { href: "/admin/carter", label: "Booking Carter", icon: ShoppingBag },
  { href: "/admin/payments", label: "Verifikasi Bayar", icon: CheckCircle },
  { href: "/admin/kendaraan", label: "Kendaraan", icon: Car },
  { href: "/admin/ratings", label: "Rating", icon: Star },
  { href: "/admin/laporan", label: "Laporan Keuangan", icon: BarChart3 },
  { href: "/admin/kota", label: "Kota & Rute", icon: MapPin },
  { href: "/admin/harga", label: "Pengaturan Harga", icon: DollarSign },
  { href: "/admin/pengumuman", label: "Pengumuman", icon: Megaphone },
  { href: "/admin/logs", label: "Log Aktivitas", icon: ClipboardList },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { clearAuth, token } = useAuth();
  const logoutMutation = useLogout();
  const [open, setOpen] = useState(false);
  const [pendingMitraCount, setPendingMitraCount] = useState(0);
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase}/admin/pending-mitra`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPendingMitraCount(d.length); })
      .catch(() => {});
  }, [token, location, apiBase]);

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        clearAuth();
        setLocation("/");
      },
    });
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex">
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-64 bg-[#1a1208] text-white z-40 flex flex-col transform transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:flex`}>
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#a85e28] flex items-center justify-center font-black text-white text-sm">R</div>
          <div>
            <div className="font-bold text-sm">RUTE Admin</div>
            <div className="text-[10px] text-white/50">Panel Administrasi</div>
          </div>
          <button onClick={() => setOpen(false)} className="ml-auto lg:hidden text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon, pendingBadge }) => {
            const active = location === href || location.startsWith(href + "/");
            const count = pendingBadge ? pendingMitraCount : 0;
            return (
              <button
                key={href}
                onClick={() => { setLocation(href); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                  active ? "bg-[#a85e28] text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-300 hover:bg-red-900/30 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {logoutMutation.isPending ? "Keluar..." : "Keluar"}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden bg-[#1a1208] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm">RUTE Admin</span>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
