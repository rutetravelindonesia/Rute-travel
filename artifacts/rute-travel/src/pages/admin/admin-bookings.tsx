import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import {
  Loader2, XCircle, Trash2, MapPin, User, Banknote, CalendarDays,
  Car, X, Phone, CreditCard, Eye, ThumbsUp, ThumbsDown,
  Armchair, Users, ChevronRight, Clock,
} from "lucide-react";

interface Booking {
  id: number;
  schedule_id: number;
  kursi: string[];
  pickup_label: string;
  pickup_detail: string | null;
  dropoff_label: string;
  dropoff_detail: string | null;
  alighting_city: string | null;
  total_amount: number;
  payment_method: string;
  payment_proof_url: string | null;
  status: string;
  pickup_confirmed_at: string | null;
  dropoff_confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  user: { id: number; nama: string; no_whatsapp: string | null } | null;
  schedule: {
    id: number;
    origin_city: string;
    destination_city: string;
    departure_date: string;
    departure_time: string;
    trip_progress: string;
  } | null;
  driver: { id: number; nama: string } | null;
}

interface BookingGroup {
  schedule_id: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  trip_progress: string;
  driver: { id: number; nama: string } | null;
  bookings: Booking[];
  totalAmount: number;
  dominantStatus: string;
  latestCreatedAt: string;
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

const TRIP_PROGRESS_COLOR: Record<string, string> = {
  belum_jemput: "bg-gray-100 text-gray-600",
  jemput: "bg-blue-100 text-blue-700",
  dalam_perjalanan: "bg-amber-100 text-amber-700",
  selesai: "bg-green-100 text-green-700",
};

const TRIP_PROGRESS_LABEL: Record<string, string> = {
  belum_jemput: "Belum Jemput",
  jemput: "Menjemput",
  dalam_perjalanan: "Dalam Perjalanan",
  selesai: "Selesai",
};

const PAYMENT_LABEL: Record<string, string> = {
  transfer: "Transfer Bank",
  tunai: "Tunai",
  qris: "QRIS",
};

function dominantStatus(bookings: Booking[]): string {
  const statuses = bookings.map(b => b.status);
  if (statuses.some(s => s === "pending")) return "pending";
  if (statuses.some(s => s === "paid")) return "paid";
  if (statuses.some(s => s === "confirmed" || s === "aktif")) return "confirmed";
  if (statuses.every(s => s === "cancelled" || s === "batal")) return "cancelled";
  if (statuses.every(s => s === "selesai")) return "selesai";
  return statuses[0] ?? "pending";
}

function groupBookings(rows: Booking[]): BookingGroup[] {
  const map = new Map<number, BookingGroup>();
  for (const b of rows) {
    const key = b.schedule_id ?? -b.id;
    if (!map.has(key)) {
      map.set(key, {
        schedule_id: b.schedule_id,
        origin_city: b.schedule?.origin_city ?? "–",
        destination_city: b.schedule?.destination_city ?? "–",
        departure_date: b.schedule?.departure_date ?? "",
        departure_time: b.schedule?.departure_time ?? "",
        trip_progress: b.schedule?.trip_progress ?? "",
        driver: b.driver,
        bookings: [],
        totalAmount: 0,
        dominantStatus: "",
        latestCreatedAt: b.created_at,
      });
    }
    const g = map.get(key)!;
    g.bookings.push(b);
    g.totalAmount += b.total_amount;
    if (b.created_at > g.latestCreatedAt) g.latestCreatedAt = b.created_at;
  }
  for (const g of map.values()) {
    g.dominantStatus = dominantStatus(g.bookings);
  }
  return Array.from(map.values()).sort((a, b) => b.latestCreatedAt.localeCompare(a.latestCreatedAt));
}

type SemanticFilter = "" | "berjalan" | "selesai" | "dibatalkan";

const TRIP_STATUS_FILTERS: { value: SemanticFilter; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "berjalan", label: "Sedang Berjalan" },
  { value: "selesai", label: "Selesai" },
  { value: "dibatalkan", label: "Dibatalkan" },
];

function applyFilter(groups: BookingGroup[], filter: SemanticFilter): BookingGroup[] {
  if (!filter) return groups;
  return groups.filter(g => {
    const tp = g.trip_progress;
    const ds = g.dominantStatus;
    if (filter === "dibatalkan") return ds === "cancelled" || ds === "batal";
    if (filter === "selesai") return ds === "selesai" || tp === "selesai";
    if (filter === "berjalan") return ds !== "cancelled" && ds !== "batal" && ds !== "selesai" && tp !== "selesai";
    return true;
  });
}

const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);
const fmtDate = (s: string) => {
  if (!s) return "–";
  return new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};
const fmtDateTime = (s: string | null) => {
  if (!s) return "–";
  return new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const resolveImgUrl = (url: string | null | undefined) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  return cloud ? `https://res.cloudinary.com/${cloud}/image/upload/${url}` : url;
};

interface ConfirmDelete { id: number; nama: string }

export default function AdminBookings() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [allRows, setAllRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [semanticFilter, setSemanticFilter] = useState<SemanticFilter>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [activeGroup, setActiveGroup] = useState<BookingGroup | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/admin/bookings`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setAllRows(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  const allGroups = applyFilter(groupBookings(allRows), semanticFilter);
  const groups = dateFilter
    ? allGroups.filter(g => g.departure_date === dateFilter)
    : allGroups;

  const todayStr = new Date().toISOString().slice(0, 10);

  async function handleCancel(id: number, groupScheduleId: number) {
    setBusy(`cancel-${id}`);
    await fetch(`${apiBase}/admin/bookings/${id}/cancel`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    await load();
    // refresh activeGroup from new data
    setActiveGroup(prev => {
      if (!prev || prev.schedule_id !== groupScheduleId) return prev;
      return null; // close and let user re-open
    });
  }

  async function handleDelete(id: number) {
    setBusy(`delete-${id}`);
    await fetch(`${apiBase}/admin/bookings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    setConfirmDelete(null);
    await load();
    setActiveGroup(null);
  }

  async function handleConfirmPayment(id: number) {
    setBusy(`confirm-${id}`);
    await fetch(`${apiBase}/admin/payments/booking/${id}/confirm`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    await load();
  }

  async function handleRejectPayment(id: number) {
    setBusy(`reject-${id}`);
    await fetch(`${apiBase}/admin/payments/booking/${id}/reject`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    await load();
  }

  return (
    <AdminLayout>
      {/* Proof lightbox */}
      {proofUrl && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" onClick={() => setProofUrl(null)}>
          <div className="relative max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setProofUrl(null)} className="absolute -top-10 right-0 text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <img src={proofUrl} alt="Bukti pembayaran" className="w-full rounded-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#1a1208]">Hapus Booking Permanen?</h3>
            <p className="text-sm text-muted-foreground">
              Booking #{confirmDelete.id} atas nama <strong>{confirmDelete.nama}</strong> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-[#f5f0e8]">
                Batal
              </button>
              <button onClick={() => handleDelete(confirmDelete.id)} disabled={!!busy}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5">
                {busy === `delete-${confirmDelete.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group detail panel */}
      {activeGroup && (
        <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setActiveGroup(null)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[92vh] rounded-t-2xl sm:rounded-none sm:left-auto sm:top-0 sm:bottom-0 sm:right-0 sm:max-h-full sm:max-w-md bg-[#fdf8f0] shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-[#fdf8f0] border-b border-border px-4 pt-4 pb-3 z-10">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-[#1a1208] leading-tight">
                    {activeGroup.origin_city} → {activeGroup.destination_city}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(activeGroup.departure_date)}{activeGroup.departure_time ? ` · ${activeGroup.departure_time}` : ""}
                  </p>
                </div>
                <button onClick={() => setActiveGroup(null)} className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#e8ddd0]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[activeGroup.dominantStatus] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABEL[activeGroup.dominantStatus] ?? activeGroup.dominantStatus}
                </span>
                {activeGroup.trip_progress && (
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${TRIP_PROGRESS_COLOR[activeGroup.trip_progress] ?? "bg-gray-100 text-gray-600"}`}>
                    {TRIP_PROGRESS_LABEL[activeGroup.trip_progress] ?? activeGroup.trip_progress}
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Mitra info */}
              {activeGroup.driver && (
                <div className="bg-white rounded-2xl border border-border p-4">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide mb-2">Mitra (Driver)</h3>
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-[#a85e28] flex-shrink-0" />
                    <span className="text-sm font-semibold text-[#1a1208]">{activeGroup.driver.nama}</span>
                  </div>
                </div>
              )}

              {/* Penumpang list */}
              <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">
                    Penumpang
                  </h3>
                  <span className="flex items-center gap-1 text-xs font-semibold text-[#a85e28]">
                    <Users className="w-3.5 h-3.5" />
                    {activeGroup.bookings.length} orang
                  </span>
                </div>

                <div className="border-t border-[#e8ddd0] divide-y divide-[#e8ddd0]">
                  {activeGroup.bookings.map((b) => (
                    <div key={b.id} className="px-4 py-3 space-y-2">
                      {/* Passenger header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1a1208]">{b.user?.nama ?? "–"}</p>
                          {b.user?.no_whatsapp && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" />{b.user.no_whatsapp}
                            </p>
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </div>

                      {/* Kursi + pickup */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Armchair className="w-3 h-3 text-[#a85e28] flex-shrink-0" />
                          <span>Kursi {b.kursi.join(", ")}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Banknote className="w-3 h-3 flex-shrink-0" />
                          <span>{fmtRp(b.total_amount)}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <MapPin className="w-3 h-3 text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="truncate">{b.pickup_label}</span>
                      </div>
                      {b.dropoff_label && (
                        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                          <MapPin className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                          <span className="truncate">
                            {b.dropoff_label}
                            {b.alighting_city && b.alighting_city !== b.schedule?.destination_city && (
                              <span className="ml-1 text-amber-600 font-semibold">(Turun di {b.alighting_city})</span>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Konfirmasi waktu */}
                      {(b.pickup_confirmed_at || b.dropoff_confirmed_at) && (
                        <div className="flex gap-3 text-[10px] text-muted-foreground">
                          {b.pickup_confirmed_at && (
                            <span className="flex items-center gap-1 text-green-700">
                              <Clock className="w-3 h-3" /> Jemput: {fmtDateTime(b.pickup_confirmed_at)}
                            </span>
                          )}
                          {b.dropoff_confirmed_at && (
                            <span className="flex items-center gap-1 text-green-700">
                              <Clock className="w-3 h-3" /> Tiba: {fmtDateTime(b.dropoff_confirmed_at)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Payment + actions */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {PAYMENT_LABEL[b.payment_method] ?? b.payment_method}
                          </span>
                          {b.payment_proof_url && (
                            <button onClick={() => setProofUrl(resolveImgUrl(b.payment_proof_url))}
                              className="flex items-center gap-0.5 text-[10px] font-semibold text-[#a85e28] hover:underline">
                              <Eye className="w-3 h-3" /> Bukti
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {b.status === "paid" && (
                            <>
                              <button onClick={() => handleConfirmPayment(b.id)} disabled={!!busy}
                                className="px-2 py-1 rounded-lg bg-green-600 text-white text-[10px] font-semibold flex items-center gap-0.5 disabled:opacity-60">
                                {busy === `confirm-${b.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                                OK
                              </button>
                              <button onClick={() => handleRejectPayment(b.id)} disabled={!!busy}
                                className="px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[10px] font-semibold flex items-center gap-0.5 disabled:opacity-60">
                                {busy === `reject-${b.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                                Tolak
                              </button>
                            </>
                          )}
                          {b.status !== "cancelled" && b.status !== "batal" && b.status !== "selesai" && (
                            <button onClick={() => handleCancel(b.id, b.schedule_id)} disabled={!!busy}
                              className="p-1.5 rounded-lg hover:bg-orange-100 text-orange-500 disabled:opacity-50">
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => setConfirmDelete({ id: b.id, nama: b.user?.nama ?? `Booking #${b.id}` })} disabled={!!busy}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="bg-white rounded-2xl border border-border px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{activeGroup.bookings.length} penumpang ·{" "}
                    {activeGroup.bookings.reduce((sum, b) => sum + b.kursi.length, 0)} kursi
                  </span>
                </div>
                <p className="text-sm font-bold text-[#1a1208]">{fmtRp(activeGroup.totalAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-[#1a1208]">Booking Reguler</h1>

          {/* Filter tanggal */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-white text-sm text-[#1a1208] focus:outline-none focus:ring-2 focus:ring-[#a85e28]/40"
              />
            </div>
            <button
              onClick={() => setDateFilter(todayStr)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${dateFilter === todayStr ? "bg-[#a85e28] text-white border-[#a85e28]" : "bg-white border-border text-muted-foreground hover:bg-[#f5f0e8]"}`}
            >
              Hari Ini
            </button>
            {dateFilter && (
              <button
                onClick={() => setDateFilter("")}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-border bg-white text-muted-foreground hover:bg-[#f5f0e8] flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          {/* Filter status */}
          <div className="flex gap-1.5 flex-wrap">
            {TRIP_STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setSemanticFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${semanticFilter === f.value ? "bg-[#a85e28] text-white" : "bg-white border border-border text-muted-foreground hover:bg-[#f5f0e8]"}`}>
                {f.label}
              </button>
            ))}
            {dateFilter && (
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">
                {groups.length} trip · {groups.reduce((s, g) => s + g.bookings.length, 0)} penumpang
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {dateFilter ? `Tidak ada booking pada tanggal ${fmtDate(dateFilter)}.` : "Tidak ada booking ditemukan."}
          </div>
        ) : (
          <div className="space-y-2.5">
            {groups.map(g => {
              const allCancelled = g.bookings.every(b => b.status === "cancelled" || b.status === "batal");
              const nameList = g.bookings.map(b => b.user?.nama ?? "–").join(", ");
              const totalKursi = g.bookings.reduce((s, b) => s + b.kursi.length, 0);
              return (
                <div key={`${g.schedule_id}-${g.latestCreatedAt}`} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <button
                    type="button"
                    className="w-full text-left p-4 space-y-3 active:bg-[#e8ddd0] transition-colors"
                    style={{ touchAction: "manipulation" }}
                    onClick={() => setActiveGroup(g)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[#1a1208]">
                          {g.origin_city} → {g.destination_city}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtDate(g.departure_date)}{g.departure_time ? ` · ${g.departure_time}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[g.dominantStatus] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABEL[g.dominantStatus] ?? g.dominantStatus}
                        </span>
                        <ChevronRight className="w-4 h-4 text-[#a85e28]" />
                      </div>
                    </div>

                    {/* Passenger chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {g.bookings.map(b => (
                        <span key={b.id}
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                            b.status === "cancelled" || b.status === "batal"
                              ? "bg-red-50 border-red-200 text-red-500 line-through opacity-60"
                              : "bg-[#fdf8f0] border-[#e8ddd0] text-[#1a1208]"
                          }`}
                        >
                          <User className="w-3 h-3" />{b.user?.nama ?? "–"}
                          <span className="text-muted-foreground">· {b.kursi.join(",")}
                          </span>
                        </span>
                      ))}
                    </div>
                  </button>

                  <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {g.driver && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Car className="w-3 h-3" />
                          <span>{g.driver.nama}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />
                        <span>{g.bookings.length} penumpang · {totalKursi} kursi</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1a1208]">
                        <Banknote className="w-3 h-3 text-muted-foreground" />
                        <span>{fmtRp(g.totalAmount)}</span>
                      </div>
                    </div>
                    {!allCancelled && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <CalendarDays className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(g.latestCreatedAt).toLocaleDateString("id-ID")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
