import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Car, ChevronRight, MapPin, Calendar, Clock, KeyRound, UserRound, FileText, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import MapPicker, { type PickedAddress } from "@/components/MapPicker";
import { resolvePhotoUrl } from "@/lib/photoUrl";
import { PhotoLightbox } from "@/components/photo-lightbox";

type RentalMode = "lepas_kunci" | "dengan_sopir" | "dua-duanya";
type BookMode = "lepas_kunci" | "dengan_sopir";
type PaymentMethod = "qris" | "transfer" | "ewallet";

interface RentalOffer {
  id: number;
  kota: string;
  mode: RentalMode;
  harga_lepas_kunci: number | null;
  harga_dengan_sopir: number | null;
  deposit: number | null;
  catatan: string | null;
  syarat: string | null;
  alamat_kantor: string | null;
  kantor_detail: string | null;
  kantor_lat: number | null;
  kantor_lng: number | null;
  driver: { id: number; nama: string; foto_profil: string | null } | null;
  kendaraan: {
    id: number;
    jenis: string;
    merek: string;
    model: string;
    warna: string;
    plat_nomor: string;
    foto_url: string | null;
    tahun: number | null;
  } | null;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "transfer", label: "Transfer Bank" },
  { value: "qris", label: "QRIS" },
  { value: "ewallet", label: "E-Wallet" },
];

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function longDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}
function initials(name: string) {
  return name.split(" ").map((s) => s[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("");
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function offersLepas(mode: RentalMode) {
  return mode === "lepas_kunci" || mode === "dua-duanya";
}
function offersSopir(mode: RentalMode) {
  return mode === "dengan_sopir" || mode === "dua-duanya";
}

export default function RentalBook() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/rental/:id/book");
  const offerId = params?.id ? parseInt(params.id, 10) : NaN;
  const { token, user } = useAuth();
  const { toast } = useToast();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [offer, setOffer] = useState<RentalOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bookMode, setBookMode] = useState<BookMode>("lepas_kunci");
  const [tanggalMulai, setTanggalMulai] = useState<string>(todayISO());
  const [tanggalSelesai, setTanggalSelesai] = useState<string>(todayISO());
  const [jamMulai, setJamMulai] = useState<string>("08:00");
  const [jamSelesai, setJamSelesai] = useState<string>("17:00");
  const [pickup, setPickup] = useState<PickedAddress | null>(null);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [dropoff, setDropoff] = useState<PickedAddress | null>(null);
  const [dropoffOpen, setDropoffOpen] = useState(false);
  const [ambilDiKantor, setAmbilDiKantor] = useState(true);
  const [catatan, setCatatan] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [submitting, setSubmitting] = useState(false);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    if (isNaN(offerId)) {
      setError("ID penawaran tidak valid.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/rental/${offerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) setError(err.error ?? "Gagal memuat penawaran.");
          return;
        }
        const data: RentalOffer = await res.json();
        if (!cancelled) {
          setOffer(data);
          setBookMode(offersLepas(data.mode) ? "lepas_kunci" : "dengan_sopir");
          setAmbilDiKantor(!!data.alamat_kantor);
        }
      } catch {
        if (!cancelled) setError("Gagal memuat penawaran.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, offerId, apiBase, setLocation]);

  const isOwnOffer = offer && user && offer.driver?.id === user.id;
  const isDuaDuanya = offer?.mode === "dua-duanya";

  const hargaPerHari = useMemo(() => {
    if (!offer) return 0;
    return bookMode === "lepas_kunci"
      ? offer.harga_lepas_kunci ?? 0
      : offer.harga_dengan_sopir ?? 0;
  }, [offer, bookMode]);

  const totalHari = useMemo(() => {
    if (!tanggalMulai || !tanggalSelesai) return 0;
    const start = new Date(tanggalMulai + "T00:00:00");
    const end = new Date(tanggalSelesai + "T00:00:00");
    const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
    return diff >= 0 ? diff + 1 : 0;
  }, [tanggalMulai, tanggalSelesai]);

  const subtotal = hargaPerHari * totalHari;
  const depositApplies = bookMode === "lepas_kunci" ? (offer?.deposit ?? 0) : 0;
  const grandTotal = subtotal + depositApplies;

  const hasOffice = !!offer?.alamat_kantor;
  const needLokasi = !ambilDiKantor;
  const validationMsg = useMemo(() => {
    if (!offer) return null;
    if (totalHari <= 0) return "Tanggal selesai harus sama atau setelah tanggal mulai.";
    if (needLokasi && !pickup) return "Pilih lokasi penjemputan.";
    if (needLokasi && !dropoff) return "Pilih lokasi pengantaran.";
    return null;
  }, [offer, totalHari, needLokasi, pickup, dropoff]);

  const canSubmit =
    !!offer &&
    !isOwnOffer &&
    totalHari > 0 &&
    hargaPerHari > 0 &&
    (!needLokasi || (!!pickup && !!dropoff)) &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit || !offer) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        mode: bookMode,
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        jam_mulai: jamMulai,
        jam_selesai: jamSelesai,
        catatan: catatan.trim() || undefined,
        payment_method: paymentMethod,
        ambil_di_kantor: ambilDiKantor,
      };
      if (needLokasi) {
        if (pickup) body.pickup = pickup;
        if (dropoff) body.dropoff = dropoff;
      }
      const res = await fetch(`${apiBase}/rental/${offer.id}/book`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal membuat pesanan.");
      }
      const created: { id: number } = await res.json();
      toast({ title: "Pesanan dibuat", description: "Lanjutkan ke pembayaran." });
      setLocation(`/rental-booking/${created.id}/bayar`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto p-6 text-center">
        <p className="text-sm font-bold text-foreground mt-12" data-testid="rental-book-error">
          {error ?? "Penawaran tidak ditemukan."}
        </p>
        <button
          onClick={() => setLocation("/rental/cari")}
          className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold"
        >
          Kembali ke pencarian
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-32">
      <div className="bg-card border-b border-border px-5 pt-10 pb-4 flex items-center gap-3">
        <button
          data-testid="back-btn"
          onClick={() => window.history.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground flex items-center gap-2">
            <Car className="w-4 h-4 text-blue-600" />
            Konfirmasi Rental
          </h1>
          <p className="text-xs text-muted-foreground">Rental · {offer.driver?.nama ?? "Mitra"}</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Mitra & kendaraan */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center font-bold text-sm flex-shrink-0 overflow-hidden ${offer.driver?.foto_profil ? "cursor-pointer" : ""}`}
              onClick={() => {
                if (offer.driver?.foto_profil) {
                  const url = resolvePhotoUrl(offer.driver.foto_profil, apiBase);
                  if (url) setPhotoModal({ url, name: offer.driver.nama });
                }
              }}
            >
              {offer.driver?.foto_profil ? (
                <img
                  src={resolvePhotoUrl(offer.driver.foto_profil, apiBase) ?? ""}
                  alt={offer.driver.nama}
                  className="w-full h-full object-cover"
                />
              ) : offer.driver ? (
                initials(offer.driver.nama)
              ) : (
                <UserRound className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate" data-testid="mitra-nama">
                {offer.driver?.nama ?? "—"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {offer.kendaraan
                  ? `${offer.kendaraan.merek} ${offer.kendaraan.model} · ${offer.kendaraan.plat_nomor}`
                  : "Kendaraan belum diatur"}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {offer.kota}
              </p>
            </div>
          </div>
        </div>

        {/* Foto Kendaraan */}
        {offer.kendaraan?.foto_url && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Car className="w-4 h-4 text-accent" />
              <p className="text-sm font-bold text-foreground">Foto Kendaraan</p>
            </div>
            <div
              className="rounded-xl overflow-hidden bg-muted cursor-pointer"
              onClick={() => {
                const url = resolvePhotoUrl(offer.kendaraan!.foto_url, apiBase);
                if (url) setPhotoModal({ url, name: `${offer.kendaraan!.merek} ${offer.kendaraan!.model}` });
              }}
            >
              <img
                src={resolvePhotoUrl(offer.kendaraan.foto_url, apiBase) ?? ""}
                alt={`${offer.kendaraan.merek} ${offer.kendaraan.model}`}
                className="w-full h-48 object-cover"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              {offer.kendaraan.warna} · {offer.kendaraan.merek} {offer.kendaraan.model}
              {offer.kendaraan.tahun ? ` · ${offer.kendaraan.tahun}` : ""}
            </p>
          </div>
        )}

        {/* Mode */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm font-bold text-foreground">Mode Rental</p>
          {isDuaDuanya ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setBookMode("lepas_kunci")}
                data-testid="book-mode-lepas_kunci"
                className={`py-3 px-2 rounded-xl border-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  bookMode === "lepas_kunci"
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-background text-foreground"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" /> Lepas Kunci
              </button>
              <button
                onClick={() => setBookMode("dengan_sopir")}
                data-testid="book-mode-dengan_sopir"
                className={`py-3 px-2 rounded-xl border-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  bookMode === "dengan_sopir"
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-background text-foreground"
                }`}
              >
                <UserRound className="w-3.5 h-3.5" /> Dengan Sopir
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-muted/40 px-4 py-3 flex items-center gap-2">
              {bookMode === "lepas_kunci" ? (
                <KeyRound className="w-4 h-4 text-accent" />
              ) : (
                <UserRound className="w-4 h-4 text-accent" />
              )}
              <p className="text-sm font-bold text-foreground">
                {bookMode === "lepas_kunci" ? "Lepas Kunci" : "Dengan Sopir"}
              </p>
            </div>
          )}
        </div>

        {/* Tanggal & jam */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm font-bold text-foreground">Periode Sewa</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Mulai
              </label>
              <input
                type="date"
                value={tanggalMulai}
                min={todayISO()}
                onChange={(e) => {
                  setTanggalMulai(e.target.value);
                  if (tanggalSelesai < e.target.value) setTanggalSelesai(e.target.value);
                }}
                data-testid="input-tanggal-mulai"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Selesai
              </label>
              <input
                type="date"
                value={tanggalSelesai}
                min={tanggalMulai || todayISO()}
                onChange={(e) => setTanggalSelesai(e.target.value)}
                data-testid="input-tanggal-selesai"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Jam Ambil
              </label>
              <input
                type="time"
                value={jamMulai}
                onChange={(e) => setJamMulai(e.target.value)}
                data-testid="input-jam-mulai"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Jam Kembali
              </label>
              <input
                type="time"
                value={jamSelesai}
                onChange={(e) => setJamSelesai(e.target.value)}
                data-testid="input-jam-selesai"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
        </div>

        {/* Lokasi pengambilan & pengantaran (kedua mode) */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm font-bold text-foreground">Lokasi Pengambilan & Pengantaran</p>

          {hasOffice && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAmbilDiKantor(true)}
                data-testid="ambil-kantor"
                className={`py-3 px-2 rounded-xl border-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  ambilDiKantor ? "border-accent bg-accent text-white" : "border-border bg-background text-foreground"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" /> Ambil di kantor
              </button>
              <button
                onClick={() => setAmbilDiKantor(false)}
                data-testid="antar-lokasi"
                className={`py-3 px-2 rounded-xl border-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  !ambilDiKantor ? "border-accent bg-accent text-white" : "border-border bg-background text-foreground"
                }`}
              >
                <Car className="w-3.5 h-3.5" /> Antar ke lokasi saya
              </button>
            </div>
          )}

          {ambilDiKantor && hasOffice ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-emerald-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-emerald-700 tracking-widest uppercase">Ambil di kantor mitra</p>
                <p className="text-sm font-bold text-foreground" data-testid="kantor-alamat">{offer.alamat_kantor}</p>
                {offer.kantor_detail && <p className="text-[11px] text-muted-foreground">{offer.kantor_detail}</p>}
              </div>
            </div>
          ) : (
            <>
              <button
                data-testid="open-pickup"
                onClick={() => setPickupOpen(true)}
                className="w-full text-left bg-muted/40 hover:bg-muted/60 rounded-xl p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">Lokasi Jemput</p>
                  {pickup ? (
                    <>
                      <p className="text-sm font-bold text-foreground truncate" data-testid="pickup-label">{pickup.label}</p>
                      {pickup.detail && <p className="text-[11px] text-muted-foreground truncate">{pickup.detail}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Belum dipilih</p>
                  )}
                  <p className="text-[10px] text-accent mt-0.5">Tap untuk pilih di peta</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

              <button
                data-testid="open-dropoff"
                onClick={() => setDropoffOpen(true)}
                className="w-full text-left bg-muted/40 hover:bg-muted/60 rounded-xl p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">Lokasi Antar</p>
                  {dropoff ? (
                    <>
                      <p className="text-sm font-bold text-foreground truncate" data-testid="dropoff-label">{dropoff.label}</p>
                      {dropoff.detail && <p className="text-[11px] text-muted-foreground truncate">{dropoff.detail}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Belum dipilih</p>
                  )}
                  <p className="text-[10px] text-accent mt-0.5">Tap untuk pilih di peta</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </>
          )}
        </div>

        {/* Syarat Rental dari mitra */}
        {offer.syarat && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
            <p className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" /> Syarat Rental
            </p>
            <p className="text-xs text-foreground whitespace-pre-line leading-relaxed" data-testid="offer-syarat">
              {offer.syarat}
            </p>
          </div>
        )}

        {/* Catatan */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" /> Catatan (opsional)
          </p>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            placeholder="Permintaan khusus untuk mitra..."
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        {/* Metode pembayaran */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-4 h-4 text-accent" /> Metode Pembayaran
          </p>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPaymentMethod(p.value)}
                data-testid={`payment-${p.value}`}
                className={`py-2.5 px-2 rounded-xl border-2 text-xs font-semibold transition-colors ${
                  paymentMethod === p.value
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ringkasan harga */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
          <p className="text-sm font-bold text-foreground">Ringkasan Harga</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatRupiah(hargaPerHari)} × {totalHari} hari</span>
            <span className="font-semibold text-foreground" data-testid="subtotal">{formatRupiah(subtotal)}</span>
          </div>
          {depositApplies > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Deposit (lepas kunci)</span>
              <span className="font-semibold text-foreground" data-testid="deposit-line">{formatRupiah(depositApplies)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-dashed border-border">
            <span className="text-sm font-bold text-foreground">Total</span>
            <span className="text-base font-extrabold text-accent" data-testid="grand-total">{formatRupiah(grandTotal)}</span>
          </div>
          {depositApplies > 0 && (
            <p className="text-[11px] text-muted-foreground">Deposit dikembalikan setelah kendaraan dikembalikan dengan baik.</p>
          )}
        </div>

        {offer.catatan && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3">
            <span className="font-bold">Catatan mitra: </span>{offer.catatan}
          </div>
        )}

        {validationMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3" data-testid="validation-msg">
            {validationMsg}
          </div>
        )}

        {isOwnOffer && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3">
            Ini penawaran rental Anda sendiri — tidak bisa booking sebagai penyewa.
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 pb-4 pt-3 bg-gradient-to-t from-background via-background to-background/0">
        <div className="bg-foreground text-card rounded-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-card/60 uppercase">Total Bayar</p>
            <p className="text-lg font-extrabold" data-testid="total-amount">{formatRupiah(grandTotal)}</p>
          </div>
          <button
            data-testid="lanjut-bayar-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold disabled:bg-card/20 disabled:text-card/60"
          >
            {submitting ? "Memproses..." : "Lanjut Bayar →"}
          </button>
        </div>
      </div>

      <MapPicker
        isOpen={pickupOpen}
        city={offer.kota}
        title={`Lokasi jemput di ${offer.kota}`}
        initialValue={pickup}
        onCancel={() => setPickupOpen(false)}
        onConfirm={(addr) => {
          setPickup(addr);
          setPickupOpen(false);
        }}
      />
      <MapPicker
        isOpen={dropoffOpen}
        city={offer.kota}
        title={`Lokasi antar di ${offer.kota}`}
        initialValue={dropoff}
        onCancel={() => setDropoffOpen(false)}
        onConfirm={(addr) => {
          setDropoff(addr);
          setDropoffOpen(false);
        }}
      />
      {photoModal && (
        <PhotoLightbox url={photoModal.url} name={photoModal.name} onClose={() => setPhotoModal(null)} />
      )}
    </div>
  );
}
