import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import {
  Loader2, XCircle, Trash2, MapPin, User, Banknote, CalendarDays, Car,
  X, Phone, CreditCard, Eye, CheckCircle2, Clock, ThumbsUp, ThumbsDown,
  ChevronRight, Armchair,
} from "lucide-react";

interface Booking {
  id: number; status: string; total_amount: number; created_at: string;
  kursi: string[]; pickup_label: string; payment_method: string;
  user: { id: number; nama: string } | null;
  driver: { id: number; nama: string } | null;
  schedule: {
    id: number;
    origin_city: string;
    destination_city: string;
    departure_date: string;
    trip_progress: string | null;
  } | null;
}

interface BookingDetail {
  id: number;
  schedule_id: number;
  kursi: string[];
  pickup_label: string;
  pickup_detail: string | null;
  dropoff_label: string;
  dropoff_detail: string | null;
  boarding_city: string | null;
  alighting_city: string | null;
  total_amount: number;
  payment_method: string;
  payment_proof_url: string | null;
  status: string;
  pickup_confirmed_at: string | null;
  dropoff_confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  penumpang: { id: number; nama: string; no_whatsapp: string | null } | null;
  schedule: {
    id: number;
    origin_city: string;
    destination_city: string;
    departure_date: string;
    departure_time: string;
    trip_progress: string;
  } | null;
  driver: { id: number; nama: string; no_whatsapp: string | null; foto_profil: string | null } | null;
  kendaraan: { merek: string; model: string; plat_nomor: string; warna: string | null; foto_url: string | null } | null;
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

const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);
const fmtDate = (s: string) => {
  if (!s) return "–";
  const d = new Date(s);
  return isNaN(d.getTime())
    ? new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};
const fmtDateTime = (s: string | null) => {
  if (!s) return "–";
  return new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

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

  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const resolveImgUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    return cloud ? `https://res.cloudinary.com/${cloud}/image/upload/${url}` : url;
  };

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

  async function openDetail(id: number) {
    setLoadingId(id);
    setDetailLoading(true);
    setDetail(null);
    setDetailError(null);
    try {
      const r = await fetch(`${apiBase}/admin/bookings/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setDetailError(j.error ?? "Gagal memuat detail booking.");
        setDetailLoading(false);
        setLoadingId(null);
        return;
      }
      const d = await r.json();
      setDetail(d);
    } catch {
      setDetailError("Terjadi kesalahan koneksi. Silakan coba lagi.");
      setDetailLoading(false);
      setLoadingId(null);
      return;
    }
    setDetailLoading(false);
    setLoadingId(null);
  }

  function closeDetail() {
    setDetail(null);
    setDetailLoading(false);
    setDetailError(null);
  }

  async function handleCancel(id: number) {
    if (!confirm("Batalkan booking ini?")) return;
    setBusy(`cancel-${id}`);
    await fetch(`${apiBase}/admin/bookings/${id}/cancel`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    if (detail?.id === id) closeDetail();
    await load();
  }

  async function handleDelete(id: number) {
    setBusy(`delete-${id}`);
    await fetch(`${apiBase}/admin/bookings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    setConfirmDelete(null);
    if (detail?.id === id) closeDetail();
    await load();
  }

  async function handleConfirmPayment(id: number) {
    setBusy(`confirm-${id}`);
    await fetch(`${apiBase}/admin/payments/booking/${id}/confirm`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    await openDetail(id);
    await load();
  }

  async function handleRejectPayment(id: number) {
    setBusy(`reject-${id}`);
    await fetch(`${apiBase}/admin/payments/booking/${id}/reject`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    await openDetail(id);
    await load();
  }

  return (
    <AdminLayout>
      {/* Proof image lightbox */}
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

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
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

      {/* Detail panel */}
      {(detail || detailLoading || detailError) && (
        <div className="fixed inset-0 z-[60] bg-black/40" onClick={closeDetail}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[92vh] rounded-t-2xl sm:rounded-none sm:left-auto sm:top-0 sm:bottom-0 sm:right-0 sm:max-h-full sm:max-w-md bg-[#fdf8f0] shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="sticky top-0 bg-[#fdf8f0] border-b border-border px-4 pt-4 pb-3 z-10">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {detail ? (
                    <>
                      <h2 className="text-base font-bold text-[#1a1208] leading-tight">
                        {detail.schedule ? `${detail.schedule.origin_city} → ${detail.schedule.destination_city}` : `Booking #${detail.id}`}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {detail.schedule ? `${fmtDate(detail.schedule.departure_date)} · ${detail.schedule.departure_time}` : ""}
                      </p>
                    </>
                  ) : detailError ? (
                    <h2 className="text-base font-bold text-[#1a1208] leading-tight">Detail Booking</h2>
                  ) : (
                    <div className="h-5 w-40 bg-[#e8ddd0] animate-pulse rounded" />
                  )}
                </div>
                <button onClick={closeDetail} className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#e8ddd0]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {detail && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[detail.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                  {detail.schedule?.trip_progress && (
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${TRIP_PROGRESS_COLOR[detail.schedule.trip_progress] ?? "bg-gray-100 text-gray-600"}`}>
                      {TRIP_PROGRESS_LABEL[detail.schedule.trip_progress] ?? detail.schedule.trip_progress}
                    </span>
                  )}
                </div>
              )}
            </div>

            {detailLoading && !detail && !detailError ? (
              <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
            ) : detailError ? (
              <div className="p-6 flex flex-col items-center gap-3 text-center">
                <XCircle className="w-8 h-8 text-red-400" />
                <p className="text-sm text-red-600">{detailError}</p>
                <button onClick={closeDetail} className="text-xs text-muted-foreground hover:underline">Tutup</button>
              </div>
            ) : detail && (
              <div className="p-4 space-y-4">

                {/* Info Penumpang */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Penumpang</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#e8ddd0] flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-[#a85e28]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a1208]">{detail.penumpang?.nama ?? "–"}</p>
                      {detail.penumpang?.no_whatsapp && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />{detail.penumpang.no_whatsapp}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info Rute & Jadwal */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Rute & Jadwal</h3>
                  {detail.schedule && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">Tanggal</p>
                        <p className="text-xs font-bold text-[#1a1208] mt-0.5">{fmtDate(detail.schedule.departure_date)}</p>
                      </div>
                      <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">Jam</p>
                        <p className="text-xs font-bold text-[#1a1208] mt-0.5">{detail.schedule.departure_time}</p>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Titik Jemput</p>
                        <p className="text-xs text-[#1a1208]">{detail.pickup_label}</p>
                        {detail.pickup_detail && <p className="text-[10px] text-muted-foreground">{detail.pickup_detail}</p>}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Titik Turun</p>
                        <p className="text-xs text-[#1a1208]">{detail.dropoff_label}</p>
                        {detail.dropoff_detail && <p className="text-[10px] text-muted-foreground">{detail.dropoff_detail}</p>}
                      </div>
                    </div>
                  </div>
                  {detail.kursi && detail.kursi.length > 0 && (
                    <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                      <Armchair className="w-3.5 h-3.5 text-[#a85e28] flex-shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Kursi</p>
                        <p className="text-xs font-semibold text-[#1a1208]">{detail.kursi.join(", ")}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Info Pembayaran */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Pembayaran</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Total Bayar</p>
                      <p className="text-xs font-bold text-[#1a1208] mt-0.5">{fmtRp(detail.total_amount)}</p>
                    </div>
                    <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Metode</p>
                      <p className="text-xs font-bold text-[#1a1208] mt-0.5">{PAYMENT_LABEL[detail.payment_method] ?? detail.payment_method}</p>
                    </div>
                  </div>
                  {detail.payment_proof_url && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CreditCard className="w-3.5 h-3.5" />
                        Bukti pembayaran tersedia
                      </div>
                      <button
                        onClick={() => setProofUrl(resolveImgUrl(detail.payment_proof_url))}
                        className="flex items-center gap-1 text-[11px] font-semibold text-[#a85e28] hover:underline"
                      >
                        <Eye className="w-3 h-3" /> Lihat Bukti
                      </button>
                    </div>
                  )}
                  {detail.status === "paid" && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleConfirmPayment(detail.id)}
                        disabled={!!busy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold disabled:opacity-60"
                      >
                        {busy === `confirm-${detail.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                        Konfirmasi Pembayaran
                      </button>
                      <button
                        onClick={() => handleRejectPayment(detail.id)}
                        disabled={!!busy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-semibold disabled:opacity-60"
                      >
                        {busy === `reject-${detail.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                        Tolak Pembayaran
                      </button>
                    </div>
                  )}
                </div>

                {/* Info Driver */}
                {detail.driver && (
                  <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                    <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Mitra (Driver)</h3>
                    <div className="flex items-center gap-3">
                      {resolveImgUrl(detail.driver.foto_profil) ? (
                        <img src={resolveImgUrl(detail.driver.foto_profil)!} alt={detail.driver.nama}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#e8ddd0] flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-[#a85e28]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1a1208]">{detail.driver.nama}</p>
                        {detail.driver.no_whatsapp && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" />{detail.driver.no_whatsapp}
                          </p>
                        )}
                      </div>
                    </div>
                    {detail.kendaraan && (
                      <div className="flex items-start gap-2 pt-2 border-t border-border">
                        <Car className="w-4 h-4 text-[#a85e28] flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-[#1a1208] space-y-0.5">
                          <p className="font-semibold">{detail.kendaraan.merek} {detail.kendaraan.model}{detail.kendaraan.warna ? ` · ${detail.kendaraan.warna}` : ""}</p>
                          <p className="font-mono text-muted-foreground">{detail.kendaraan.plat_nomor}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Konfirmasi Perjalanan */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden">
                  <div className="px-4 pt-3 pb-2">
                    <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Konfirmasi Perjalanan</h3>
                  </div>
                  <div className="border-t border-[#e8ddd0] divide-y divide-[#e8ddd0]">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {detail.pickup_confirmed_at
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="text-xs text-[#1a1208]">Jemput dikonfirmasi</span>
                      </div>
                      {detail.pickup_confirmed_at
                        ? <span className="text-[10px] font-semibold text-green-700">{fmtDateTime(detail.pickup_confirmed_at)}</span>
                        : <span className="text-[10px] text-muted-foreground">Belum</span>}
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {detail.dropoff_confirmed_at
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="text-xs text-[#1a1208]">Tiba dikonfirmasi</span>
                      </div>
                      {detail.dropoff_confirmed_at
                        ? <span className="text-[10px] font-semibold text-green-700">{fmtDateTime(detail.dropoff_confirmed_at)}</span>
                        : <span className="text-[10px] text-muted-foreground">Belum</span>}
                    </div>
                  </div>
                </div>

                {/* Aksi */}
                <div className="flex gap-2">
                  {detail.status !== "cancelled" && detail.status !== "batal" && detail.status !== "selesai" && (
                    <button
                      onClick={() => handleCancel(detail.id)}
                      disabled={!!busy}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-orange-200 bg-orange-50 text-orange-600 text-xs font-semibold disabled:opacity-60"
                    >
                      {busy === `cancel-${detail.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      Batalkan
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDelete({ id: detail.id, nama: detail.penumpang?.nama ?? `Booking #${detail.id}` })}
                    disabled={!!busy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-semibold disabled:opacity-60"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                </div>
              </div>
            )}
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
          <div className="space-y-2.5">
            {rows.map(b => (
              <div
                key={b.id}
                className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
              >
                {/* Tappable detail area */}
                <button
                  type="button"
                  className="w-full text-left p-4 space-y-3 active:bg-[#e8ddd0] transition-colors"
                  style={{ touchAction: "manipulation" }}
                  disabled={loadingId === b.id}
                  onClick={() => openDetail(b.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground font-medium">#{b.id}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                      {loadingId === b.id
                        ? <Loader2 className="w-4 h-4 animate-spin text-[#a85e28]" />
                        : <ChevronRight className="w-4 h-4 text-[#a85e28]" />
                      }
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="font-semibold text-sm text-[#1a1208]">{b.user?.nama ?? "–"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-[#1a1208]">
                        {b.schedule ? `${b.schedule.origin_city} → ${b.schedule.destination_city}` : "–"}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Footer with meta info + action buttons */}
                <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>{b.driver?.nama ?? "Belum ada mitra"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1a1208]">
                      <Banknote className="w-3 h-3 text-muted-foreground" />
                      <span>{fmtRp(b.total_amount)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="w-3 h-3" />
                      <span>{new Date(b.created_at).toLocaleDateString("id-ID")}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {b.status !== "cancelled" && b.status !== "batal" && b.status !== "selesai" && (
                      <button onClick={() => handleCancel(b.id)} disabled={!!busy}
                        title="Batalkan booking"
                        style={{ touchAction: "manipulation" }}
                        className="p-1.5 rounded-lg hover:bg-orange-100 text-orange-500 disabled:opacity-50 transition-colors">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDelete({ id: b.id, nama: b.user?.nama ?? `Booking #${b.id}` })}
                      disabled={!!busy}
                      title="Hapus permanen"
                      style={{ touchAction: "manipulation" }}
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
