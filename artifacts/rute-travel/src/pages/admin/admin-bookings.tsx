import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, XCircle, Trash2 } from "lucide-react";

interface Booking {
  id: number; status: string; total_amount: number; created_at: string;
  kursi: string[]; pickup_label: string; payment_method: string;
  user: { id: number; nama: string } | null;
  schedule: {
    id: number;
    origin_city: string;
    destination_city: string;
    departure_date: string;
    trip_progress: string | null;
  } | null;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  aktif: "bg-green-100 text-green-700",
  selesai: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
  batal: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Sudah Bayar",
  confirmed: "Dikonfirmasi",
  aktif: "Aktif",
  selesai: "Selesai",
  cancelled: "Dibatalkan",
  batal: "Dibatalkan",
};

type SemanticFilter = "" | "berjalan" | "selesai" | "dibatalkan";

const TRIP_STATUS_FILTERS: { value: SemanticFilter; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "berjalan", label: "Sedang Berjalan" },
  { value: "selesai", label: "Selesai" },
  { value: "dibatalkan", label: "Dibatalkan" },
];

function applySemanticFilter(rows: Booking[], filter: SemanticFilter): Booking[] {
  if (!filter) return rows;
  return rows.filter(b => {
    const tripProgress = b.schedule?.trip_progress ?? null;
    const isDibatalkan = b.status === "cancelled" || b.status === "batal";
    const isSelesai = b.status === "selesai" || tripProgress === "selesai";
    const isBerjalan = !isDibatalkan && !isSelesai;
    if (filter === "dibatalkan") return isDibatalkan;
    if (filter === "selesai") return isSelesai;
    if (filter === "berjalan") return isBerjalan;
    return true;
  });
}

interface ConfirmDelete { id: number; nama: string }

export default function AdminBookings() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [allRows, setAllRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [semanticFilter, setSemanticFilter] = useState<SemanticFilter>("");
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/bookings`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setAllRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  const rows = applySemanticFilter(allRows, semanticFilter);

  async function handleCancel(id: number) {
    if (!confirm("Batalkan booking ini?")) return;
    setBusy(`cancel-${id}`);
    await fetch(`${apiBase}/admin/bookings/${id}/cancel`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    await load();
  }

  async function handleDelete(id: number) {
    setBusy(`delete-${id}`);
    await fetch(`${apiBase}/admin/bookings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    setConfirmDelete(null);
    await load();
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);

  return (
    <AdminLayout>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#1a1208]">Hapus Booking Permanen?</h3>
            <p className="text-sm text-muted-foreground">
              Booking #{confirmDelete.id} atas nama <strong>{confirmDelete.nama}</strong> akan dihapus permanen dari database.
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-[#f5f0e8]">
                Batal
              </button>
              <button onClick={() => handleDelete(confirmDelete.id)} disabled={!!busy}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5">
                {busy === `delete-${confirmDelete.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#1a1208]">Booking Reguler</h1>
          <div className="flex gap-1.5 flex-wrap">
            {TRIP_STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setSemanticFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${semanticFilter === f.value ? "bg-[#a85e28] text-white" : "bg-white border border-border text-muted-foreground hover:bg-[#f5f0e8]"}`}>
                {f.label}
              </button>
            ))}
          </div>
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
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(b.created_at).toLocaleDateString("id-ID")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {b.status !== "cancelled" && b.status !== "batal" && b.status !== "selesai" && (
                            <button onClick={() => handleCancel(b.id)} disabled={!!busy}
                              title="Batalkan booking"
                              className="p-1.5 rounded-lg hover:bg-orange-100 text-orange-500 disabled:opacity-50">
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmDelete({ id: b.id, nama: b.user?.nama ?? `Booking #${b.id}` })}
                            disabled={!!busy}
                            title="Hapus permanen"
                            className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
