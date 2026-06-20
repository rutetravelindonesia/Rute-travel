import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  Calendar,
  Clock4,
  Car,
  MessageCircle,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileText,
  Banknote,
  MapPin,
  KeyRound,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { getDriverPhotoUrl } from "@/lib/utils";

interface RentalBookingDetail {
  id: number;
  mode: "lepas_kunci" | "dengan_sopir";
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
  status: string;
  penyewa: { id: number; nama: string; foto_profil: string | null } | null;
  kendaraan: { id: number; jenis: string; merek: string; model: string; warna: string; plat_nomor: string; foto_url: string | null; tahun: number } | null;
}

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function formatRupiah(n: number) {
  return "Rp" + (n ?? 0).toLocaleString("id-ID");
}
function initials(nama: string) {
  return nama.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function modeLabel(m: string) {
  return m === "lepas_kunci" ? "Lepas Kunci" : "Dengan Sopir";
}

function actionLabel(status: string): string | null {
  if (status === "confirmed") return "Serahkan Kendaraan";
  if (status === "aktif") return "Selesaikan Rental";
  return null;
}

function statusBadgeCls(status: string) {
  if (status === "pending") return "bg-yellow-100 text-yellow-800";
  if (status === "paid") return "bg-blue-100 text-blue-800";
  if (status === "batal" || status === "cancelled") return "bg-red-100 text-red-800";
  if (status === "selesai") return "bg-green-100 text-green-800";
  if (status === "aktif") return "bg-indigo-100 text-indigo-800";
  return "bg-amber-100 text-amber-800";
}
function statusBadgeLabel(status: string) {
  if (status === "pending") return "Menunggu Pembayaran";
  if (status === "paid") return "Menunggu Konfirmasi Admin";
  if (status === "batal" || status === "cancelled") return "Dibatalkan";
  if (status === "selesai") return "Selesai";
  if (status === "aktif") return "Sedang Berjalan";
  if (status === "confirmed") return "Siap Serah Terima";
  return status;
}

export default function RentalDetailDriverPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/rental-booking/:id/driver-detail");
  const { token } = useAuth();
  const bookingId = params?.id ? Number(params.id) : null;

  const [data, setData] = useState<RentalBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyProgress, setBusyProgress] = useState(false);
  const [busyChat, setBusyChat] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  async function load() {
    if (!token || !bookingId) return;
    try {
      const res = await fetch(`${apiBase}/rental-bookings/${bookingId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setData(j);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [token, bookingId]);

  async function openChat() {
    if (!token || !bookingId) return;
    setBusyChat(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/chat/threads`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ booking_type: "rental", booking_id: bookingId }),
      });
      const j = await res.json();
      if (!res.ok || !j?.id) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setLocation(`/chat/${j.id}`);
    } catch (e: any) {
      setActionError(`Gagal membuka chat: ${e.message ?? e}`);
    } finally {
      setBusyChat(false);
    }
  }

  async function advanceProgress() {
    if (!token || !bookingId || !data) return;
    setBusyProgress(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/rental-bookings/${bookingId}/progress`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setActionError(`Gagal memperbarui status: ${e.message ?? e}`);
    } finally {
      setBusyProgress(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-700 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-center text-muted-foreground">{error ?? "Data tidak ditemukan."}</p>
        <button onClick={() => setLocation("/pesanan")} className="text-sm text-amber-700 underline">
          Kembali ke Pesanan
        </button>
      </div>
    );
  }

  const isLepasKunci = data.mode === "lepas_kunci";
  const btn = actionLabel(data.status);
  const isDone = data.status === "selesai";
  const nama = data.penyewa?.nama ?? "—";
  const totalTransfer = data.total_amount + (isLepasKunci ? data.deposit : 0);
  const blockedByPayment = data.status === "paid" || data.status === "pending";

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="bg-[#a85e28] text-white px-4 pt-12 pb-6">
        <button onClick={() => setLocation("/pesanan")} className="flex items-center gap-1 text-white/80 mb-3 text-sm">
          <ArrowLeft className="w-4 h-4" /> Pesanan
        </button>
        <p className="text-xs uppercase tracking-widest text-white/70 mb-1">Rental · {modeLabel(data.mode)}</p>
        <h1 className="text-xl font-bold leading-tight">
          {data.kendaraan ? `${data.kendaraan.merek} ${data.kendaraan.model}` : "Rental Kendaraan"}
        </h1>
        <div className="flex items-center gap-3 mt-2 text-white/80 text-sm">
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(data.tanggal_mulai)}</span>
          <span className="flex items-center gap-1"><Clock4 className="w-3.5 h-3.5" />{data.jam_mulai}</span>
        </div>
        <div className="mt-3">
          <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${statusBadgeCls(data.status)}`}>
            {statusBadgeLabel(data.status)}
          </span>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Penyewa */}
        <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
          <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-3">Penyewa</p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-amber-800 overflow-hidden relative">
                <span>{initials(nama)}</span>
                {(() => {
                  const photoUrl = getDriverPhotoUrl(apiBase, data.penyewa?.foto_profil);
                  return photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={nama}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : null;
                })()}
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">{nama}</p>
              </div>
            </div>
            <button
              onClick={openChat}
              disabled={busyChat}
              className="w-10 h-10 rounded-full bg-amber-50 hover:bg-amber-100 flex items-center justify-center disabled:opacity-50 transition-colors"
              aria-label="Chat penyewa"
            >
              {busyChat ? <Loader2 className="w-4 h-4 text-amber-700 animate-spin" /> : <MessageCircle className="w-4 h-4 text-amber-700" />}
            </button>
          </div>
        </div>

        {/* Kendaraan */}
        {data.kendaraan && (
          <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2">Kendaraan</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {data.kendaraan.foto_url ? (
                  <img
                    src={data.kendaraan.foto_url.startsWith("http") ? data.kendaraan.foto_url : `${apiBase}/storage${data.kendaraan.foto_url}`}
                    alt={`${data.kendaraan.merek} ${data.kendaraan.model}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Car className="w-5 h-5 text-amber-700" />
                )}
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">{data.kendaraan.merek} {data.kendaraan.model}</p>
                <p className="text-[11px] text-muted-foreground">{data.kendaraan.warna} · {data.kendaraan.plat_nomor} · {data.kendaraan.tahun}</p>
              </div>
            </div>
          </div>
        )}

        {/* Jadwal */}
        <div className="bg-card rounded-2xl p-4 border border-border shadow-sm space-y-2.5">
          <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Jadwal Sewa</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/40 rounded-xl px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Mulai</p>
              <p className="text-xs font-bold text-foreground mt-0.5">{formatDate(data.tanggal_mulai)}</p>
              <p className="text-[11px] text-muted-foreground">{data.jam_mulai}</p>
            </div>
            <div className="bg-muted/40 rounded-xl px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Selesai</p>
              <p className="text-xs font-bold text-foreground mt-0.5">{formatDate(data.tanggal_selesai)}</p>
              <p className="text-[11px] text-muted-foreground">{data.jam_selesai}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Durasi {data.total_hari} hari</p>
        </div>

        {/* Titik jemput (hanya dengan_sopir) */}
        {!isLepasKunci && data.pickup_label && (
          <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Titik Jemput
            </p>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-foreground leading-snug">{data.pickup_label}</p>
            </div>
          </div>
        )}

        {/* Catatan */}
        {data.catatan && (
          <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Catatan Penyewa
            </p>
            <p className="text-sm text-foreground italic leading-relaxed">"{data.catatan}"</p>
          </div>
        )}

        {/* Pembayaran */}
        <div className="bg-card rounded-2xl p-4 border border-border shadow-sm space-y-1.5">
          <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5" /> Pembayaran
          </p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{formatRupiah(data.harga_per_hari)} × {data.total_hari} hari</p>
            <p className="text-sm font-bold text-foreground">{formatRupiah(data.total_amount)}</p>
          </div>
          {isLepasKunci && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Deposit</p>
              <p className="text-sm font-bold text-foreground">{formatRupiah(data.deposit)}</p>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-dashed border-border">
            <p className="text-sm font-bold text-foreground">Total</p>
            <p className="text-base font-bold text-amber-700">{formatRupiah(totalTransfer)}</p>
          </div>
        </div>

        {/* Mode badge note */}
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
          {isLepasKunci ? <KeyRound className="w-4 h-4 text-amber-700 flex-shrink-0" /> : <UserRound className="w-4 h-4 text-amber-700 flex-shrink-0" />}
          <p className="text-[11px] text-amber-800 leading-snug">
            {isLepasKunci
              ? "Mode Lepas Kunci — kendaraan diserahkan tanpa sopir. Pastikan deposit & kondisi kendaraan dicek."
              : "Mode Dengan Sopir — Anda mengantar penyewa selama masa sewa."}
          </p>
        </div>

        {/* Aksi */}
        {blockedByPayment && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <span className="text-amber-500 flex-shrink-0 text-sm leading-none mt-0.5">⚠</span>
            <p className="text-[11px] text-amber-800 leading-snug">
              Pembayaran penyewa belum dikonfirmasi admin. Tombol serah terima akan aktif setelah pembayaran dikonfirmasi.
            </p>
          </div>
        )}
        {btn ? (
          <button
            onClick={advanceProgress}
            disabled={busyProgress}
            className="w-full py-4 rounded-2xl bg-[#a85e28] text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-[#92501f] disabled:opacity-60 transition-colors shadow-sm"
          >
            {busyProgress ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {btn}
          </button>
        ) : isDone ? (
          <div className="w-full py-4 rounded-2xl bg-green-50 text-green-700 font-bold text-base flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Rental Selesai
          </div>
        ) : null}
      </div>
    </div>
  );
}
