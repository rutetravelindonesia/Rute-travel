import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import {
  Loader2, XCircle, Trash2, User, Banknote, CalendarDays,
  X, Phone, Car, CreditCard, Eye, ThumbsUp, ThumbsDown, ChevronRight, KeyRound, UserRound,
} from "lucide-react";

interface RentalBooking {
  id: number;
  status: string;
  total_amount: number;
  created_at: string;
  mode: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  jam_mulai: string;
  jam_selesai: string;
  deposit: number;
  total_hari: number;
  payment_method: string | null;
  user: { id: number; nama: string } | null;
  kendaraan: { merek: string; model: string; plat_nomor: string } | null;
}

interface RentalBookingDetail {
  id: number;
  mode: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  jam_mulai: string;
  jam_selesai: string;
  pickup_label: string | null;
  catatan: string | null;
  total_hari: number;
  harga_per_hari: number;
  deposit: number;
  total_amount: number;
  payment_method: string | null;
  payment_proof_url: string | null;
  status: string;
  created_at: string;
  penyewa: { id: number; nama: string; no_whatsapp: string | null } | null;
  driver: { id: number; nama: string; no_whatsapp: string | null; nama_bank: string | null; no_rekening: string | null; nama_pemilik_rekening: string | null } | null;
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

const MODE_LABEL: Record<string, string> = {
  lepas_kunci: "Lepas Kunci",
  dengan_sopir: "Dengan Sopir",
};

const PAYMENT_LABEL: Record<string, string> = {
  transfer: "Transfer Bank",
  tunai: "Tunai",
  qris: "QRIS",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "paid", label: "Perlu Verifikasi" },
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "aktif", label: "Aktif" },
  { value: "selesai", label: "Selesai" },
  { value: "batal", label: "Dibatalkan" },
];

interface ConfirmDelete { id: number; nama: string }

export default function AdminRental() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<RentalBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [detail, setDetail] = useState<RentalBookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    const r = await fetch(`${apiBase}/admin/rental-bookings${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase, statusFilter]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function openDetail(id: number) {
    setLoadingId(id);
    setDetailLoading(true);
    setDetail(null);
    setDetailError(null);
    try {
      const r = await fetch(`${apiBase}/admin/rental-bookings/${id}`, { headers: { Authorization: `Bearer ${token}` } });
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

  async function handleDelete(id: number) {
    setBusy(`delete-${id}`);
    await fetch(`${apiBase}/admin/rental-bookings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    setConfirmDelete(null);
    if (detail?.id === id) closeDetail();
    await load();
  }

  async function handleConfirmPayment(id: number) {
    if (!confirm("Konfirmasi pembayaran rental ini?")) return;
    setBusy(`confirm-${id}`);
    try {
      const r = await fetch(`${apiBase}/admin/rental-bookings/${id}/confirm`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "Gagal mengkonfirmasi pembayaran.");
        return;
      }
      await load();
      await openDetail(id);
    } catch {
      alert("Terjadi kesalahan koneksi. Silakan coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRejectPayment(id: number) {
    if (!confirm("Tolak pembayaran rental ini? Bukti bayar akan dihapus dan status kembali ke pending.")) return;
    setBusy(`reject-${id}`);
    try {
      const r = await fetch(`${apiBase}/admin/rental-bookings/${id}/reject`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "Gagal menolak pembayaran.");
        return;
      }
      await load();
      await openDetail(id);
    } catch {
      alert("Terjadi kesalahan koneksi. Silakan coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n ?? 0);
  const fmtDate = (d: string) => {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  const resolveImgUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    return cloud ? `https://res.cloudinary.com/${cloud}/image/upload/${url}` : `${apiBase}/storage${url}`;
  };

  return (
    <AdminLayout>
      {/* ===== LIGHTBOX BUKTI BAYAR ===== */}
      {proofUrl && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setProofUrl(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white" onClick={() => setProofUrl(null)}>
            <X className="w-5 h-5" />
          </button>
          <img src={proofUrl} alt="Bukti Pembayaran" className="max-w-full max-h-[85vh] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* ===== CONFIRM DELETE MODAL ===== */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#1a1208]">Hapus Rental Permanen?</h3>
            <p className="text-sm text-muted-foreground">
              Booking rental #{confirmDelete.id} atas nama <strong>{confirmDelete.nama}</strong> akan dihapus permanen dari database. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-[#f5f0e8]">
                Batal
              </button>
              <button onClick={() => handleDelete(confirmDelete.id)} disabled={!!busy} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5">
                {busy === `delete-${confirmDelete.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DETAIL PANEL ===== */}
      {(detail || detailLoading || detailError) && (
        <div className="fixed inset-0 z-[60] bg-black/40" onClick={closeDetail}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[92vh] rounded-t-2xl sm:rounded-none sm:left-auto sm:top-0 sm:bottom-0 sm:right-0 sm:max-h-full sm:max-w-md bg-[#fdf8f0] shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#fdf8f0] border-b border-border px-4 pt-4 pb-3 z-10">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {detail ? (
                    <>
                      <h2 className="text-base font-bold text-[#1a1208] leading-tight">
                        {detail.kendaraan ? `${detail.kendaraan.merek} ${detail.kendaraan.model}` : `Rental #${detail.id}`}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(detail.tanggal_mulai)} → {fmtDate(detail.tanggal_selesai)}
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
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    {detail.mode === "lepas_kunci" ? <KeyRound className="w-3 h-3" /> : <UserRound className="w-3 h-3" />}
                    {MODE_LABEL[detail.mode] ?? detail.mode}
                  </span>
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
                {/* Penyewa */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Penyewa</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#e8ddd0] flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-[#a85e28]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a1208]">{detail.penyewa?.nama ?? "–"}</p>
                      {detail.penyewa?.no_whatsapp && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />{detail.penyewa.no_whatsapp}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Jadwal */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Jadwal Sewa</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Mulai</p>
                      <p className="text-xs font-bold text-[#1a1208] mt-0.5">{fmtDate(detail.tanggal_mulai)}</p>
                      <p className="text-[10px] text-muted-foreground">{detail.jam_mulai}</p>
                    </div>
                    <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Selesai</p>
                      <p className="text-xs font-bold text-[#1a1208] mt-0.5">{fmtDate(detail.tanggal_selesai)}</p>
                      <p className="text-[10px] text-muted-foreground">{detail.jam_selesai}</p>
                    </div>
                  </div>
                  {detail.mode === "dengan_sopir" && detail.pickup_label && (
                    <div className="flex items-start gap-2 pt-1">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Titik Jemput</p>
                        <p className="text-xs text-[#1a1208]">{detail.pickup_label}</p>
                      </div>
                    </div>
                  )}
                  {detail.catatan && (
                    <div className="pt-1">
                      <p className="text-[10px] text-muted-foreground">Catatan</p>
                      <p className="text-xs text-[#1a1208] italic">"{detail.catatan}"</p>
                    </div>
                  )}
                </div>

                {/* Pembayaran */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Pembayaran</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Harga / hari</p>
                      <p className="text-xs font-bold text-[#1a1208] mt-0.5">{fmtRp(detail.harga_per_hari)}</p>
                    </div>
                    <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Durasi</p>
                      <p className="text-xs font-bold text-[#1a1208] mt-0.5">{detail.total_hari} hari</p>
                    </div>
                    <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Total Bayar</p>
                      <p className="text-xs font-bold text-[#1a1208] mt-0.5">{fmtRp(detail.total_amount)}</p>
                    </div>
                    {detail.mode === "lepas_kunci" && (
                      <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">Deposit</p>
                        <p className="text-xs font-bold text-[#1a1208] mt-0.5">{fmtRp(detail.deposit)}</p>
                      </div>
                    )}
                    <div className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Metode</p>
                      <p className="text-xs font-bold text-[#1a1208] mt-0.5">{detail.payment_method ? (PAYMENT_LABEL[detail.payment_method] ?? detail.payment_method) : "—"}</p>
                    </div>
                  </div>
                  {detail.payment_proof_url && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CreditCard className="w-3.5 h-3.5" />
                        Bukti pembayaran tersedia
                      </div>
                      <button onClick={() => setProofUrl(resolveImgUrl(detail.payment_proof_url))} className="flex items-center gap-1 text-[11px] font-semibold text-[#a85e28] hover:underline">
                        <Eye className="w-3 h-3" /> Lihat Bukti
                      </button>
                    </div>
                  )}
                  {detail.status === "paid" && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleConfirmPayment(detail.id)} disabled={!!busy} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold disabled:opacity-60">
                        {busy === `confirm-${detail.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                        Konfirmasi Pembayaran
                      </button>
                      <button onClick={() => handleRejectPayment(detail.id)} disabled={!!busy} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-semibold disabled:opacity-60">
                        {busy === `reject-${detail.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                        Tolak Pembayaran
                      </button>
                    </div>
                  )}
                </div>

                {/* Mitra */}
                {detail.driver && (
                  <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                    <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Mitra (Driver)</h3>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#e8ddd0] flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-[#a85e28]" />
                      </div>
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

                {/* Info Transfer ke Mitra */}
                <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-[#a85e28]" />
                    <h3 className="text-xs font-bold text-[#1a1208] uppercase tracking-wide">Info Transfer ke Mitra</h3>
                  </div>
                  {detail.driver?.no_rekening ? (
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
                  ) : (
                    <p className="text-sm text-muted-foreground">Mitra belum mengisi informasi rekening.</p>
                  )}
                </div>

                {/* Aksi */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete({ id: detail.id, nama: detail.penyewa?.nama ?? `Rental #${detail.id}` })}
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
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-[#1a1208]">Booking Rental</h1>

          {/* Filter status */}
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === f.value ? "bg-[#a85e28] text-white" : "bg-white border border-border text-muted-foreground hover:bg-[#f5f0e8]"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Tidak ada booking rental.</div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-4 space-y-3 active:bg-[#e8ddd0] transition-colors"
                  style={{ touchAction: "manipulation" }}
                  disabled={loadingId === b.id}
                  onClick={() => openDetail(b.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-[#1a1208]">
                        #{b.id} · {b.kendaraan ? `${b.kendaraan.merek} ${b.kendaraan.model}` : "Rental"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(b.tanggal_mulai)} → {fmtDate(b.tanggal_selesai)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                      <Car className="w-3.5 h-3.5 text-[#a85e28] flex-shrink-0" />
                      <span className="text-sm text-[#1a1208]">{b.kendaraan?.plat_nomor ?? "–"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.mode === "lepas_kunci" ? <KeyRound className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" /> : <UserRound className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
                      <span className="text-sm text-[#1a1208]">{MODE_LABEL[b.mode] ?? b.mode}</span>
                    </div>
                  </div>
                </button>

                <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1a1208]">
                      <Banknote className="w-3 h-3 text-muted-foreground" />
                      <span>{fmtRp(b.total_amount)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="w-3 h-3" />
                      <span>Dipesan: {new Date(b.created_at).toLocaleDateString("id-ID")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setConfirmDelete({ id: b.id, nama: b.user?.nama ?? `Rental #${b.id}` })}
                      disabled={!!busy}
                      title="Hapus permanen"
                      style={{ touchAction: "manipulation" }}
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-50 transition-colors"
                    >
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
