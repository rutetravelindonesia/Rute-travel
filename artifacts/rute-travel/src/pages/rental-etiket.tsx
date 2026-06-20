import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Ticket, Loader2, CheckCircle2, Clock4, Car, KeyRound, UserRound, MapPin, Star, Camera } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { PhotoLightbox } from "@/components/photo-lightbox";

interface RentalBooking {
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
  booking_code: string;
  is_mitra: boolean;
  my_rating: { stars: number; comment: string | null } | null;
  driver: { id: number; nama: string; foto_profil: string | null } | null;
  penyewa: { id: number; nama: string; foto_profil: string | null } | null;
  kendaraan: { id: number; jenis: string; merek: string; model: string; warna: string; plat_nomor: string; foto_url: string | null; tahun: number } | null;
}

function formatRupiah(n: number) {
  return "Rp " + (n ?? 0).toLocaleString("id-ID");
}
function longDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function modeLabel(m: string) {
  return m === "lepas_kunci" ? "Lepas Kunci" : "Dengan Sopir";
}
function statusInfo(status: string): { label: string; tone: string; Icon: typeof CheckCircle2 } {
  switch (status) {
    case "selesai": return { label: "Rental selesai", tone: "bg-muted text-muted-foreground", Icon: CheckCircle2 };
    case "aktif": return { label: "Kendaraan sedang digunakan", tone: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 };
    case "confirmed": return { label: "Voucher aktif — menunggu serah terima", tone: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 };
    case "batal":
    case "cancelled": return { label: "Dibatalkan", tone: "bg-red-100 text-red-800", Icon: Clock4 };
    default: return { label: status, tone: "bg-muted text-muted-foreground", Icon: Clock4 };
  }
}

export default function RentalEtiket() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/rental-booking/:id/etiket");
  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const { token, user } = useAuth();
  const backPath = user?.role === "driver" ? "/pesanan" : "/dashboard-penumpang";
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [booking, setBooking] = useState<RentalBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState<{ booking_status: string } | null>(null);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  const [showRating, setShowRating] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  async function fetchBooking(silent = false) {
    if (!token || isNaN(id)) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${apiBase}/rental-bookings/${id}/etiket`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body?.status === "pending_verification") {
          setBooking(null);
          setPendingVerification({ booking_status: body.booking_status ?? "paid" });
          setError(null);
          return;
        }
        setError("Tidak boleh mengakses voucher ini.");
        return;
      }
      if (res.status === 401) {
        setLocation("/login");
        return;
      }
      if (res.status === 404) {
        setError("Voucher tidak ditemukan.");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Gagal memuat voucher (${res.status}).`);
        return;
      }
      const data: RentalBooking = await res.json();
      setBooking(data);
      setPendingVerification(null);
      setError(null);
    } catch {
      setError("Koneksi ke server gagal. Coba lagi.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) { setLocation("/login"); return; }
    if (isNaN(id)) { setError("ID booking tidak valid."); setLoading(false); return; }
    fetchBooking();
  }, [token, id]);

  async function submitRating() {
    if (!booking || ratingStars === 0) return;
    setRatingBusy(true);
    setRatingError(null);
    try {
      const res = await fetch(`${apiBase}/rental-bookings/${id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stars: ratingStars, comment: ratingComment.trim() || undefined }),
      });
      if (res.ok) {
        setRatingDone(true);
        setShowRating(false);
        await fetchBooking(true);
      } else {
        const j = await res.json().catch(() => ({}));
        setRatingError(j.error ?? `Gagal mengirim rating (${res.status})`);
      }
    } catch {
      setRatingError("Koneksi gagal. Coba lagi.");
    } finally {
      setRatingBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto p-6 text-center">
        <p className="text-sm font-bold text-foreground mt-12" data-testid="etiket-error">{error}</p>
        <button onClick={() => setLocation(backPath)} className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold">
          Ke beranda
        </button>
      </div>
    );
  }

  if (pendingVerification) {
    const isPending = pendingVerification.booking_status === "pending";
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto flex flex-col">
        <div className="bg-card border-b border-border px-5 pt-10 pb-4 flex items-center gap-3">
          <button onClick={() => setLocation(backPath)} className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-foreground">Voucher Rental</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock4 className="w-10 h-10 text-amber-600" />
          </div>
          {isPending ? (
            <>
              <h2 className="text-xl font-bold text-foreground">Belum Ada Bukti Pembayaran</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pesanan rental Anda sudah dibuat. Silakan upload bukti pembayaran agar dapat diverifikasi oleh admin.
              </p>
              <button
                onClick={() => setLocation(`/rental-booking/${id}/bayar`)}
                className="mt-2 w-full py-3 rounded-2xl bg-accent text-white text-sm font-bold"
              >
                Upload Bukti Pembayaran
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground">Menunggu Verifikasi Admin</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tim RUTE sedang memeriksa bukti pembayaran Anda. Voucher akan terbit secara otomatis setelah pembayaran dikonfirmasi oleh admin.
              </p>
              <button
                onClick={() => setLocation(backPath)}
                className="mt-2 w-full py-3 rounded-2xl bg-accent text-white text-sm font-bold"
              >
                Kembali ke Beranda
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto p-6 text-center">
        <p className="text-sm font-bold text-foreground mt-12">Voucher tidak ditemukan.</p>
        <button onClick={() => setLocation(backPath)} className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold">
          Ke beranda
        </button>
      </div>
    );
  }

  const si = statusInfo(booking.status);
  const Icon = si.Icon;
  const isLepasKunci = booking.mode === "lepas_kunci";
  const code = booking.booking_code;
  const totalTransfer = booking.total_amount + (isLepasKunci ? booking.deposit : 0);
  const canRate = !booking.is_mitra && booking.status === "selesai" && !booking.my_rating && !ratingDone;

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      <div className="bg-card border-b border-border px-5 pt-10 pb-4 flex items-center gap-3">
        <button data-testid="back-btn" onClick={() => setLocation(backPath)} className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Voucher Rental</h1>
          <p className="text-xs text-muted-foreground" data-testid="booking-code">{code}</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${si.tone}`} data-testid="booking-status">
          <Icon className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">{si.label}</p>
        </div>

        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="bg-foreground text-card px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4" />
              <span className="text-xs font-bold tracking-widest uppercase">Rental</span>
            </div>
            <span className="text-[10px] font-bold tracking-widest opacity-70">RUTE</span>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {booking.kendaraan?.foto_url ? (
                  <button
                    className="w-full h-full cursor-zoom-in"
                    onClick={() => {
                      const url = booking.kendaraan!.foto_url!.startsWith("http") ? booking.kendaraan!.foto_url! : `${apiBase}/storage${booking.kendaraan!.foto_url!}`;
                      setPhotoModal({ url, name: `${booking.kendaraan!.merek} ${booking.kendaraan!.model}` });
                    }}
                  >
                    <img
                      src={booking.kendaraan.foto_url.startsWith("http") ? booking.kendaraan.foto_url : `${apiBase}/storage${booking.kendaraan.foto_url}`}
                      alt={`${booking.kendaraan.merek} ${booking.kendaraan.model}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <Car className="w-7 h-7 text-amber-700" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-foreground" data-testid="etiket-kendaraan">
                  {booking.kendaraan ? `${booking.kendaraan.merek} ${booking.kendaraan.model}` : "—"}
                </p>
                {booking.kendaraan && (
                  <p className="text-[11px] text-muted-foreground">{booking.kendaraan.warna} · {booking.kendaraan.plat_nomor} · {booking.kendaraan.tahun}</p>
                )}
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800" data-testid="mode-badge">
                  {isLepasKunci ? <KeyRound className="w-3 h-3" /> : <UserRound className="w-3 h-3" />}
                  {modeLabel(booking.mode)}
                </span>
              </div>
            </div>

            <div className="border-t border-dashed border-border" />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Mulai</p>
                <p className="font-bold text-foreground" data-testid="etiket-mulai">{longDate(booking.tanggal_mulai)}</p>
                <p className="text-[11px] text-muted-foreground">{booking.jam_mulai}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Selesai</p>
                <p className="font-bold text-foreground" data-testid="etiket-selesai">{longDate(booking.tanggal_selesai)}</p>
                <p className="text-[11px] text-muted-foreground">{booking.jam_selesai}</p>
              </div>
            </div>

            {!isLepasKunci && booking.pickup_label && (
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Titik Jemput</p>
                  <p className="text-sm font-bold text-foreground">{booking.pickup_label}</p>
                </div>
              </div>
            )}

            <div className="border-t border-dashed border-border" />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{formatRupiah(booking.harga_per_hari)} × {booking.total_hari} hari</span>
                <span className="font-bold text-foreground">{formatRupiah(booking.total_amount)}</span>
              </div>
              {isLepasKunci && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Deposit (dikembalikan)</span>
                  <span className="font-bold text-foreground" data-testid="etiket-deposit">{formatRupiah(booking.deposit)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-bold text-foreground">Total</span>
                <span className="text-base font-extrabold text-accent" data-testid="etiket-total">{formatRupiah(totalTransfer)}</span>
              </div>
            </div>
          </div>

          <div className="bg-muted/40 px-4 py-3 border-t border-dashed border-border flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Kode Booking</p>
              <p className="text-base font-extrabold tracking-wider text-foreground">{code}</p>
            </div>
            <div className="w-16 h-16 rounded-lg bg-card border-2 border-foreground flex items-center justify-center" aria-label="QR booking">
              <div className="grid grid-cols-5 gap-[2px]">
                {Array.from({ length: 25 }).map((_, i) => {
                  const seed = (booking.id * 11 + i * 17) % 5;
                  const filled = seed < 3;
                  return <span key={i} className={`w-1.5 h-1.5 ${filled ? "bg-foreground" : "bg-transparent"}`} />;
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Rating */}
        {!booking.is_mitra && booking.status === "selesai" && (
          booking.my_rating || ratingDone ? (
            <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-col items-center gap-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`w-5 h-5 ${s <= (booking.my_rating?.stars ?? ratingStars) ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Terima kasih atas penilaian Anda!</span>
              {booking.my_rating?.comment && (
                <span className="text-xs text-foreground italic">"{booking.my_rating.comment}"</span>
              )}
            </div>
          ) : canRate ? (
            <button
              data-testid="rate-btn"
              onClick={() => setShowRating(true)}
              className="w-full py-3 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 text-sm font-bold flex items-center justify-center gap-2"
            >
              <Star className="w-4 h-4" /> Beri Rating Mitra
            </button>
          ) : null
        )}

        <button
          data-testid="kembali-btn"
          onClick={() => setLocation(backPath)}
          className="w-full py-3 rounded-xl bg-muted text-foreground text-sm font-bold"
        >
          Kembali ke Beranda
        </button>
      </div>

      {showRating && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={() => setShowRating(false)}>
          <div className="bg-card rounded-t-3xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold text-foreground text-center">Bagaimana pengalaman rental Anda?</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onMouseEnter={() => setRatingHover(s)}
                  onMouseLeave={() => setRatingHover(0)}
                  onClick={() => setRatingStars(s)}
                  className="p-1"
                >
                  <Star className={`w-9 h-9 transition-colors ${s <= (ratingHover || ratingStars) ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Komentar (opsional)..."
              rows={3}
              className="w-full text-sm rounded-xl border border-amber-200 bg-muted px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            {ratingError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">{ratingError}</p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => { setShowRating(false); setRatingError(null); }} className="py-3 rounded-xl bg-muted text-foreground text-sm font-bold">
                Nanti Saja
              </button>
              <button
                onClick={submitRating}
                disabled={ratingStars === 0 || ratingBusy}
                className="py-3 rounded-xl bg-[#a85e28] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {ratingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                Kirim Penilaian
              </button>
            </div>
          </div>
        </div>
      )}

      {photoModal && (
        <PhotoLightbox url={photoModal.url} name={photoModal.name} onClose={() => setPhotoModal(null)} />
      )}
    </div>
  );
}
