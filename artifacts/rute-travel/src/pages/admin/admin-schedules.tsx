import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Trash2 } from "lucide-react";

interface Schedule {
  id: number; origin_city: string; destination_city: string; departure_date: string;
  departure_time: string; capacity: number; price_per_seat: number; trip_progress: string;
  created_at: string; driver: { id: number; nama: string } | null;
}

const PROGRESS_LABEL: Record<string, string> = {
  belum_jemput: "Belum Jemput", sudah_jemput: "Sudah Jemput",
  dalam_perjalanan: "Dalam Perjalanan", selesai: "Selesai",
};

export default function AdminSchedules() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/schedules`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function handleDelete(id: number) {
    if (!confirm("Hapus jadwal ini? Semua booking terkait mungkin terpengaruh.")) return;
    await fetch(`${apiBase}/admin/schedules/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1208]">Manajemen Jadwal</h1>
          <span className="text-sm text-muted-foreground">{rows.length} jadwal</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Belum ada jadwal.</div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f0e8]">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Rute</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Tanggal</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Driver</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Harga/Kursi</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Kapasitas</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(s => (
                    <tr key={s.id} className="hover:bg-[#f5f0e8]/50">
                      <td className="px-4 py-3 font-medium">{s.origin_city} → {s.destination_city}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(s.departure_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} {s.departure_time}</td>
                      <td className="px-4 py-3">{s.driver?.nama ?? "-"}</td>
                      <td className="px-4 py-3">{fmtRp(s.price_per_seat)}</td>
                      <td className="px-4 py-3">{s.capacity} kursi</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {PROGRESS_LABEL[s.trip_progress] ?? s.trip_progress}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
