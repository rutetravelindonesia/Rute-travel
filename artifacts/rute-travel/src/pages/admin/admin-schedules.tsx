import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Trash2, Pencil, X } from "lucide-react";

interface Schedule {
  id: number; origin_city: string; destination_city: string; departure_date: string;
  departure_time: string; capacity: number; price_per_seat: number; trip_progress: string;
  created_at: string; driver: { id: number; nama: string } | null;
}

const PROGRESS_LABEL: Record<string, string> = {
  belum_jemput: "Belum Jemput", sudah_jemput: "Sudah Jemput",
  dalam_perjalanan: "Dalam Perjalanan", selesai: "Selesai",
};

interface EditState {
  schedule: Schedule;
  departure_date: string;
  departure_time: string;
  price_per_seat: string;
  error: string | null;
  loading: boolean;
}

export default function AdminSchedules() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<EditState | null>(null);

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

  function openEdit(s: Schedule) {
    setEditState({
      schedule: s,
      departure_date: s.departure_date,
      departure_time: s.departure_time,
      price_per_seat: String(s.price_per_seat),
      error: null,
      loading: false,
    });
  }

  async function handleEditSave() {
    if (!editState) return;
    setEditState(prev => prev ? { ...prev, loading: true, error: null } : null);
    const body: Record<string, any> = {};
    if (editState.departure_date !== editState.schedule.departure_date) body.departure_date = editState.departure_date;
    if (editState.departure_time !== editState.schedule.departure_time) body.departure_time = editState.departure_time;
    if (Number(editState.price_per_seat) !== editState.schedule.price_per_seat) body.price_per_seat = Number(editState.price_per_seat);
    if (!Object.keys(body).length) {
      setEditState(prev => prev ? { ...prev, loading: false, error: "Tidak ada perubahan." } : null);
      return;
    }
    const r = await fetch(`${apiBase}/admin/schedules/${editState.schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setEditState(prev => prev ? { ...prev, loading: false, error: j.error ?? "Gagal menyimpan." } : null);
      return;
    }
    setEditState(null);
    await load();
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);

  return (
    <AdminLayout>
      {editState && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1a1208]">Edit Jadwal #{editState.schedule.id}</h3>
              <button onClick={() => setEditState(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f5f0e8]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {editState.schedule.origin_city} → {editState.schedule.destination_city} · {editState.schedule.driver?.nama ?? "–"}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#1a1208] block mb-1">Tanggal Keberangkatan</label>
                <input type="date" value={editState.departure_date}
                  onChange={e => setEditState(prev => prev ? { ...prev, departure_date: e.target.value } : null)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#a85e28]/40" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#1a1208] block mb-1">Jam Keberangkatan</label>
                <input type="time" value={editState.departure_time}
                  onChange={e => setEditState(prev => prev ? { ...prev, departure_time: e.target.value } : null)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#a85e28]/40" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#1a1208] block mb-1">Harga per Kursi (Rp)</label>
                <input type="number" value={editState.price_per_seat} min={0}
                  onChange={e => setEditState(prev => prev ? { ...prev, price_per_seat: e.target.value } : null)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#a85e28]/40" />
              </div>
            </div>

            {editState.error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{editState.error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditState(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-[#f5f0e8]">
                Batal
              </button>
              <button onClick={handleEditSave} disabled={editState.loading}
                className="flex-1 py-2.5 rounded-xl bg-[#a85e28] text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5">
                {editState.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

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
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(s.departure_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} {s.departure_time}
                      </td>
                      <td className="px-4 py-3">{s.driver?.nama ?? "-"}</td>
                      <td className="px-4 py-3">{fmtRp(s.price_per_seat)}</td>
                      <td className="px-4 py-3">{s.capacity} kursi</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {PROGRESS_LABEL[s.trip_progress] ?? s.trip_progress}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(s)} title="Edit jadwal"
                            className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(s.id)} title="Hapus jadwal"
                            className="p-1.5 rounded-lg hover:bg-red-100 text-red-500">
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
