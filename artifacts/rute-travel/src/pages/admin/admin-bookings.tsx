import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, XCircle } from "lucide-react";

interface Booking {
  id: number; status: string; total_amount: number; created_at: string;
  kursi: string[]; pickup_label: string; payment_method: string;
  user: { id: number; nama: string } | null;
  schedule: { id: number; origin_city: string; destination_city: string; departure_date: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function AdminBookings() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const r = await fetch(`${apiBase}/admin/bookings?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase, statusFilter]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function handleCancel(id: number) {
    if (!confirm("Batalkan booking ini?")) return;
    await fetch(`${apiBase}/admin/bookings/${id}/cancel`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#1a1208]">Booking Reguler</h1>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
            <option value="">Semua Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Sudah Bayar</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Tidak ada booking ditemukan.</div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f0e8]">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-xs">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Penumpang</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Rute</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Total</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Tanggal</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(b => (
                    <tr key={b.id} className="hover:bg-[#f5f0e8]/50">
                      <td className="px-4 py-3 text-muted-foreground">{b.id}</td>
                      <td className="px-4 py-3 font-medium">{b.user?.nama ?? "-"}</td>
                      <td className="px-4 py-3">{b.schedule ? `${b.schedule.origin_city} → ${b.schedule.destination_city}` : "-"}</td>
                      <td className="px-4 py-3">{fmtRp(b.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(b.created_at).toLocaleDateString("id-ID")}</td>
                      <td className="px-4 py-3">
                        {b.status !== "cancelled" && (
                          <button onClick={() => handleCancel(b.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
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
