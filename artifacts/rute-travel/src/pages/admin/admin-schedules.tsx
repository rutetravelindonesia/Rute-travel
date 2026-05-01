import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Trash2, Pencil, X, User, Car, MapPin, CheckCircle2, XCircle, Clock, ChevronRight, Phone, CreditCard, Eye, Banknote } from "lucide-react";

interface Schedule {
  id: number; origin_city: string; destination_city: string; departure_date: string;
  departure_time: string; capacity: number; price_per_seat: number; trip_progress: string;
  created_at: string; driver: { id: number; nama: string } | null;
  penumpang_count: number; total_pendapatan: number;
}

interface BookingDetail {
  id: number;
  penumpang_nama: string;
  penumpang_no_wa: string | null;
  kursi: string[];
  total_amount: number;
  payment_method: string;
  payment_proof_url: string | null;
  pickup_label: string;
  pickup_detail: string | null;
  dropoff_label: string;
  dropoff_detail: string | null;
  status: string;
  pickup_confirmed_at: string | null;
  dropoff_confirmed_at: string | null;
  created_at: string;
}

interface ScheduleDetail extends Schedule {
  driver: {
    id: number; nama: string;
    no_whatsapp: string | null; foto_profil: string | null;
    nama_bank: string | null; no_rekening: string | null; nama_pemilik_rekening: string | null;
  } | null;
  kendaraan: {
    merek: string; model: string;
    plat_nomor: string; warna: string | null; foto_url: string | null;
  } | null;
  bookings: BookingDetail[];
}

interface EditState {
  schedule: Schedule;
  departure_date: string;
  departure_time: string;
  price_per_seat: string;
  error: string | null;
  loading: boolean;
}

const PROGRESS_LABEL: Record<string, string> = {
  belum_jemput: "Belum Jemput", sudah_jemput: "Sudah Jemput",
  semua_naik: "Semua Naik", dalam_perjalanan: "Dalam Perjalanan", selesai: "Selesai",
};

const PROGRESS_COLOR: Record<string, string> = {
  belum_jemput: "bg-gray-100 text-gray-600",
  sudah_jemput: "bg-blue-100 text-blue-700",
  semua_naik: "bg-indigo-100 text-indigo-700",
  dalam_perjalanan: "bg-amber-100 text-amber-700",
  selesai: "bg-green-100 text-green-700",
};

const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Bayar",
  paid: "Sudah Bayar",
  bayar: "Sudah Bayar",
  confirmed: "Dikonfirmasi",
  aktif: "Aktif",
  selesai: "Selesai",
  batal: "Dibatalkan",
  cancelled: "Dibatalkan",
};

const BOOKING_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  bayar: "bg-blue-100 text-blue-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  aktif: "bg-amber-100 text-amber-700",
  selesai: "bg-green-100 text-green-700",
  batal: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

const PAYMENT_LABEL: Record<string, string> = {
  transfer: "Transfer Bank",
  tunai: "Tunai",
  qris: "QRIS",
};

export default function AdminSchedules() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<EditState | null>(null);

  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

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

  async function openDetail(id: number) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const r = await fetch(`${apiBase}/admin/schedules/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { setDetailLoading(false); return; }
      const d = await r.json();
      setDetail(d);
    } catch {
      setDetailLoading(false);
    }
    setDetailLoading(false);
  }

  function closeDetail() {
    setDetail(null);
    setDetailLoading(false);
  }

  async function handleCancelBooking(bookingId: number) {
    if (!confirm("Batalkan booking ini? Tindakan ini tidak dapat diundur.")) return;
    setCancellingId(bookingId);
    try {
      const r = await fetch(`${apiBase}/admin/bookings/${bookingId}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "Gagal membatalkan booking. Silakan coba lagi.");
        return;
      }
      if (detail) await openDetail(detail.id);
    } finally {
      setCancellingId(null);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm("Hapus jadwal ini? Semua booking terkait mungkin terpengaruh.")) return;
    await fetch(`${apiBase}/admin/schedules/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (detail?.id === id) closeDetail();
    await load();
  }

  function openEdit(e: React.MouseEvent, s: Schedule) {
    e.stopPropagation();
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
    if (detail) await openDetail(detail.id);
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const fmtDateTime = (s: string | null) => {
    if (!s) return null;
    return new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const resolveImgUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    return cloud ? `https://res.cloudinary.com/${cloud}/image/upload/${url}` : url;
  };

  return (
    <AdminLayout>
      {/* ===== LIGHTBOX BUKTI BAYAR ===== */}
      {proofUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setProofUrl(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white"
            onClick={() => setProofUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={proofUrl}
            alt="Bukti Pembayaran"
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* ===== EDIT MODAL ===== */}
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
                <p className="text-xs text-red-500 mt-1.5">Aplikasi mengambil biaya 10% dari harga yang anda input.</p>
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

      {/* ===== DETAIL PANEL ===== */}
      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={closeDetail}
        >
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
                        {detail.origin_city} → {detail.destination_city}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(detail.departure_date)} · {detail.departure_time}
                      </p>
                    </>
                  ) : (
                    <div className="h-5 w-40 bg-[#e8ddd0] animate-pulse rounded" />
                  )}
                </div>
                <button
                  onClick={closeDetail}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#e8ddd0]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {detail && (
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${PROGRESS_COLOR[detail.trip_progress] ?? "bg-gray-100 text-gray-600"}`}>
                    {PROGRESS_LABEL[detail.trip_progress] ?? detail.trip_progress}
                  </span>
                  <span className="text-xs text-muted-foreground">{detail.capacity} kursi</span>
                </div>
              )}
            </div>

            {detailLoading && !detail ? (
              <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
            ) : detail && (
              <div className="p-4 space-y-4">

                {/* Ringkasan Pendapatan */}
                <div className="bg-white rounded-2xl border border-border p-4 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Pendapatan</p>
                    <p className="text-sm font-bold text-green-700 mt-0.5">{fmtRp(detail.total_pendapatan)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Penumpang</p>
                    <p className="text-sm font-bold text-[#1a1208] mt-0.5">{detail.bookings.filter(b => ["confirmed","aktif","selesai"].includes(b.status)).length} / {detail.capacity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Harga/Kursi</p>
                    <p className="text-sm font-bold text-[#1a1208] mt-0.5">{fmtRp(detail.price_per_seat)}</p>
                  </div>
                </div>

                {/* Info Mitra */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Mitra (Driver)</h3>
                  {detail.driver ? (
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
                  ) : (
                    <p className="text-sm text-muted-foreground">Belum ada mitra.</p>
                  )}

                  {detail.kendaraan && (
                    <div className="flex items-start gap-2 pt-2 border-t border-border">
                      <Car className="w-4 h-4 text-[#a85e28] flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-[#1a1208] space-y-0.5">
                        <p className="font-semibold">{detail.kendaraan.merek} {detail.kendaraan.model} {detail.kendaraan.warna ? `· ${detail.kendaraan.warna}` : ""}</p>
                        <p className="font-mono text-muted-foreground">{detail.kendaraan.plat_nomor}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Info Transfer */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-[#a85e28]" />
                    <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Info Transfer ke Mitra</h3>
                  </div>
                  {detail.driver?.no_rekening ? (
                    <>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                          <p className="text-[10px] text-muted-foreground">Bank</p>
                          <p className="text-sm font-bold text-[#1a1208] mt-0.5">{detail.driver.nama_bank}</p>
                        </div>
                        <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                          <p className="text-[10px] text-muted-foreground">Nomor Rekening</p>
                          <p className="text-sm font-bold text-[#1a1208] mt-0.5 font-mono tracking-wider">{detail.driver.no_rekening}</p>
                        </div>
                        <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                          <p className="text-[10px] text-muted-foreground">Atas Nama</p>
                          <p className="text-sm font-bold text-[#1a1208] mt-0.5">{detail.driver.nama_pemilik_rekening}</p>
                        </div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center justify-between">
                        <p className="text-xs text-amber-700 font-medium">Nominal transfer (nett 90%)</p>
                        <p className="text-sm font-extrabold text-amber-700">{fmtRp(Math.round(detail.total_pendapatan * 0.9))}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Mitra belum mengisi informasi rekening.</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={e => openEdit(e, detail)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-600 text-xs font-semibold"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Jadwal
                  </button>
                  <button
                    onClick={e => handleDelete(e, detail.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                </div>

                {/* Daftar Penumpang */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">
                    Daftar Penumpang ({detail.bookings.length})
                  </h3>

                  {detail.bookings.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-border p-6 text-center text-muted-foreground text-sm">
                      Belum ada penumpang.
                    </div>
                  ) : (
                    detail.bookings.map((b, idx) => (
                      <div key={b.id} className="bg-white rounded-2xl border border-border overflow-hidden">
                        {/* Booking header */}
                        <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                              <span className="text-[11px] font-bold text-[#a85e28]">{idx + 1}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[#1a1208]">{b.penumpang_nama}</p>
                              {b.penumpang_no_wa && (
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Phone className="w-2.5 h-2.5" />{b.penumpang_no_wa}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${BOOKING_STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                          </span>
                        </div>

                        <div className="px-4 pb-3 space-y-2.5 border-t border-[#f5f0e8] pt-2.5">
                          {/* Kursi & Bayar */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                              <p className="text-[10px] text-muted-foreground">Kursi</p>
                              <p className="text-xs font-bold text-[#1a1208] mt-0.5">{b.kursi.join(", ")}</p>
                            </div>
                            <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                              <p className="text-[10px] text-muted-foreground">Total Bayar</p>
                              <p className="text-xs font-bold text-[#1a1208] mt-0.5">{fmtRp(b.total_amount)}</p>
                            </div>
                          </div>

                          {/* Metode & Bukti */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CreditCard className="w-3.5 h-3.5" />
                              {PAYMENT_LABEL[b.payment_method] ?? b.payment_method}
                            </div>
                            {b.payment_proof_url && (
                              <button
                                onClick={() => setProofUrl(resolveImgUrl(b.payment_proof_url))}
                                className="flex items-center gap-1 text-[11px] font-semibold text-[#a85e28] hover:underline"
                              >
                                <Eye className="w-3 h-3" /> Lihat Bukti
                              </button>
                            )}
                          </div>

                          {/* Titik Jemput & Turun */}
                          <div className="space-y-1.5">
                            <div className="flex items-start gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] text-muted-foreground">Titik Jemput</p>
                                <p className="text-xs text-[#1a1208]">{b.pickup_label}</p>
                                {b.pickup_detail && <p className="text-[10px] text-muted-foreground">{b.pickup_detail}</p>}
                              </div>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] text-muted-foreground">Titik Turun</p>
                                <p className="text-xs text-[#1a1208]">{b.dropoff_label}</p>
                                {b.dropoff_detail && <p className="text-[10px] text-muted-foreground">{b.dropoff_detail}</p>}
                              </div>
                            </div>
                          </div>

                          {/* Status Konfirmasi Perjalanan */}
                          <div className="border border-[#e8ddd0] rounded-xl divide-y divide-[#e8ddd0]">
                            <div className="flex items-center justify-between px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {b.pickup_confirmed_at ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs text-[#1a1208]">Jemput dikonfirmasi</span>
                              </div>
                              {b.pickup_confirmed_at ? (
                                <span className="text-[10px] font-semibold text-green-700">{fmtDateTime(b.pickup_confirmed_at)}</span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">Belum</span>
                              )}
                            </div>
                            <div className="flex items-center justify-between px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {b.dropoff_confirmed_at ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <span className="text-xs text-[#1a1208]">Tiba dikonfirmasi</span>
                              </div>
                              {b.dropoff_confirmed_at ? (
                                <span className="text-[10px] font-semibold text-green-700">{fmtDateTime(b.dropoff_confirmed_at)}</span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">Belum</span>
                              )}
                            </div>
                          </div>

                          {(b.status === "batal" || b.status === "cancelled") && (
                            <div className="flex items-center gap-1.5 bg-red-50 rounded-xl px-3 py-2">
                              <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                              <p className="text-[11px] text-red-600">Booking dibatalkan</p>
                            </div>
                          )}

                          {!["batal", "cancelled", "selesai"].includes(b.status) && (
                            <button
                              onClick={() => handleCancelBooking(b.id)}
                              disabled={cancellingId !== null}
                              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-semibold disabled:opacity-60"
                            >
                              {cancellingId === b.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                              Batalkan Booking
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== MAIN TABLE ===== */}
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
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Mitra</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">P</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#1a1208] text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(s => (
                    <tr
                      key={s.id}
                      className="hover:bg-[#f5f0e8]/60 cursor-pointer transition-colors"
                      onClick={() => openDetail(s.id)}
                    >
                      <td className="px-4 py-3 font-medium text-[#1a1208]">
                        <span className="flex items-center gap-1 flex-wrap">
                          {s.origin_city}
                          <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          {s.destination_city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                        {fmtDate(s.departure_date)} {s.departure_time}
                      </td>
                      <td className="px-4 py-3 text-xs">{s.driver?.nama ?? <span className="text-muted-foreground">-</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold text-xs ${s.penumpang_count > 0 ? "text-[#1a1208]" : "text-muted-foreground"}`}>
                          {s.penumpang_count}
                        </span>
                        <span className="text-muted-foreground text-[11px]"> /{s.capacity}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PROGRESS_COLOR[s.trip_progress] ?? "bg-gray-100 text-gray-600"}`}>
                          {PROGRESS_LABEL[s.trip_progress] ?? s.trip_progress}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={e => openEdit(e, s)} title="Edit jadwal"
                            className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => handleDelete(e, s.id)} title="Hapus jadwal"
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
