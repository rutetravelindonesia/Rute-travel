import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Users, Ticket, TrendingUp, Activity, Car, Clock, UserCheck, DollarSign } from "lucide-react";
import { Loader2 } from "lucide-react";

interface Stats {
  total_users: number;
  total_drivers: number;
  total_penumpang: number;
  total_bookings: number;
  booking_hari_ini: number;
  pendapatan_total: number;
  trip_aktif: number;
  pembayaran_pending: number;
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-[#1a1208]">{value}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    function loadStats() {
      fetch(`${apiBase}/admin/stats`, { headers: { Authorization: `Bearer ${token!}` } })
        .then(r => r.json()).then(setStats).catch(() => {}).finally(() => setLoading(false));
    }
    loadStats();
    const interval = setInterval(loadStats, 30_000);
    return () => clearInterval(interval);
  }, [token, user]);

  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1208]">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Ringkasan aktivitas RUTE Travel</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#a85e28]" /></div>
        ) : stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total User" value={fmt(stats.total_users)} icon={Users} color="bg-blue-500" />
            <StatCard label="Mitra Driver" value={fmt(stats.total_drivers)} icon={Car} color="bg-emerald-500" />
            <StatCard label="Penumpang" value={fmt(stats.total_penumpang)} icon={UserCheck} color="bg-violet-500" />
            <StatCard label="Total Booking" value={fmt(stats.total_bookings)} icon={Ticket} color="bg-amber-500" />
            <StatCard label="Booking Hari Ini" value={fmt(stats.booking_hari_ini)} icon={Clock} color="bg-orange-500" />
            <StatCard label="Trip Aktif" value={fmt(stats.trip_aktif)} icon={Activity} color="bg-red-500" />
            <StatCard label="Bayar Pending" value={fmt(stats.pembayaran_pending)} icon={TrendingUp} color="bg-yellow-500" />
            <StatCard label="Total Pendapatan" value={fmtRp(stats.pendapatan_total)} icon={DollarSign} color="bg-green-600" />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Gagal memuat statistik.</p>
        )}
      </div>
    </AdminLayout>
  );
}
