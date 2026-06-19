import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Car, ChevronRight, MapPin, Navigation, User, Sparkles, Calendar, Clock } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import MapPicker, { type PickedAddress } from "@/components/MapPicker";
import { resolvePhotoUrl } from "@/lib/photoUrl";
import { PhotoLightbox } from "@/components/photo-lightbox";

interface CarterMitra {
  settings_id: number;
  origin_city: string;
  is_24_hours: boolean;
  hours_start: string | null;
  hours_end: string | null;
  driver: { id: number; nama: string; foto_profil: string | null } | null;
  kendaraan: {
    id: number;
    jenis: string;
    merek: string;
    model: string;
    warna: string;
    plat_nomor: string;
    foto_url: string | null;
  } | null;
  dates: string[];
  routes: { destination_city: string; price: number }[];
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function longDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}
function initials(name: string) {
  return name.split(" ").map((s) => s[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("");
}

export default function CarterBook() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/carter/:id/book");
  const settingsId = params?.id ? parseInt(params.id, 10) : NaN;
  const { token, user } = useAuth();
  const { toast } = useToast();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const date = query.get("date") ?? "";
  const time = query.get("time") ?? "";
  const dest = query.get("dest") ?? "";

  const [mitra, setMitra] = useState<CarterMitra | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickup, setPickup] = useState<PickedAddress | null>(null);
  const [dropoff, setDropoff] = useState<PickedAddress | null>(null);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [dropoffOpen, setDropoffOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    if (isNaN(settingsId)) {
      setError("ID mitra tidak valid.");
      setLoading(false);
      return;
    }
    if (!date || !time || !dest) {
      setError("Parameter pencarian tidak lengkap. Kembali ke halaman Cari Carter.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/carter/mitra/${settingsId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) setError(err.error ?? "Gagal memuat mitra.");
          return;
        }
        const data: CarterMitra = await res.json();
        if (!cancelled) setMitra(data);
      } catch {
        if (!cancelled) setError("Gagal memuat mitra.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, settingsId, apiBase, date, time, dest, setLocation]);

  const matchedRoute = mitra?.routes.find((r) => r.destination_city === dest) ?? null;
  const total = matchedRoute?.price ?? 0;
  const isOwnCarter = mitra && user && mitra.driver?.id === user.id;
  const dateAvailable = mitra?.dates.includes(date) ?? false;
  const jamCocok = mitra
    ? mitra.is_24_hours
      ? true
      : !!mitra.hours_start &&
        !!mitra.hours_end &&
        time >= mitra.hours_start &&
        time <= mitra.hours_end
    : false;

  const validationMsg =
    mitra && !matchedRoute
      ? `Mitra ini tidak melayani rute ke ${dest}.`
      : mitra && !dateAvailable
      ? "Mitra tidak available pada tanggal ini."
      : mitra && !jamCocok
      ? `Jam ${time} di luar jam operasional mitra.`
      : null;

  const canSubmit =
    !!mitra &&
    !!matchedRoute &&
    !isOwnCarter &&
    dateAvailable &&
    jamCocok &&
    !!pickup &&
    !!dropoff &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit || !mitra || !pickup || !dropoff) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/carter/${mitra.settings_id}/book`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time,
          destination_city: dest,
          pickup,
          dropoff,
          payment_method: "transfer",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal membuat pesanan.");
      }
      const created: { id: number } = await res.json();
      toast({ title: "Pesanan dibuat", description: "Lanjutkan ke pembayaran." });
      setLocation(`/carter-booking/${created.id}/bayar`);
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

  if (error || !mitra) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto p-6 text-center">
        <p className="text-sm font-bold text-foreground mt-12" data-testid="carter-book-error">
          {error ?? "Mitra tidak ditemukan."}
        </p>
        <button
          onClick={() => setLocation("/carter/cari")}
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
            <Sparkles className="w-4 h-4 text-amber-500" />
            Konfirmasi Carter
          </h1>
          <p className="text-xs text-muted-foreground">Carter · {mitra.driver?.nama ?? "Mitra"}</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Mitra card */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center font-bold text-sm flex-shrink-0 overflow-hidden ${mitra.driver?.foto_profil ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (mitra.driver?.foto_profil) {
                    const url = resolvePhotoUrl(mitra.driver.foto_profil, apiBase);
                    if (url) setPhotoModal({ url, name: mitra.driver.nama });
                  }
                }}
              >
                {mitra.driver?.foto_profil ? (
                  <img
                    src={resolvePhotoUrl(mitra.driver.foto_profil, apiBase) ?? ""}
                    alt={mitra.driver.nama}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      e.currentTarget.parentElement!.innerHTML = `<span class="text-sm font-bold">${initials(mitra.driver!.nama)}</span>`;
                    }}
                  />
                ) : mitra.driver ? (
                  initials(mitra.driver.nama)
                ) : (
                  <User className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate" data-testid="mitra-nama">
                  {mitra.driver?.nama ?? "—"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {mitra.kendaraan
                    ? `${mitra.kendaraan.merek} ${mitra.kendaraan.model} · ${mitra.kendaraan.plat_nomor}`
                    : "Kendaraan belum diatur"}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span
                className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded uppercase ${
                  mitra.is_24_hours ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {mitra.is_24_hours ? "24 Jam" : `${mitra.hours_start}–${mitra.hours_end}`}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-border flex items-center justify-between">
            <p className="text-sm font-bold text-foreground" data-testid="rute-asal">{mitra.origin_city}</p>
            <div className="flex-1 mx-2 border-t border-dotted border-border" />
            <p className="text-sm font-bold text-foreground" data-testid="rute-tujuan">{dest}</p>
          </div>
        </div>

        {/* Jadwal */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-sm font-bold text-foreground mb-3">Jadwal Berangkat</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/40 rounded-xl p-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent" />
              <div>
                <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">Tanggal</p>
                <p className="text-sm font-bold text-foreground" data-testid="travel-date">{longDate(date)}</p>
              </div>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <div>
                <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">Jam</p>
                <p className="text-sm font-bold text-foreground" data-testid="travel-time">{time}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pickup & Dropoff */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm font-bold text-foreground">Titik Jemput &amp; Antar</p>

          <button
            data-testid="open-pickup"
            onClick={() => setPickupOpen(true)}
            className="w-full text-left bg-muted/40 hover:bg-muted/60 rounded-xl p-3 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
                Jemput di {mitra.origin_city}
              </p>
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
              <Navigation className="w-4 h-4 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
                Antar ke {dest}
              </p>
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
        </div>

        {/* Foto Kendaraan */}
        {mitra.kendaraan?.foto_url && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Car className="w-4 h-4 text-accent" />
              <p className="text-sm font-bold text-foreground">Foto Kendaraan</p>
            </div>
            <div
              className="rounded-xl overflow-hidden bg-muted cursor-pointer"
              onClick={() => {
                const url = resolvePhotoUrl(mitra.kendaraan!.foto_url, apiBase);
                if (url) setPhotoModal({ url, name: `${mitra.kendaraan!.merek} ${mitra.kendaraan!.model}` });
              }}
            >
              <img
                src={resolvePhotoUrl(mitra.kendaraan.foto_url, apiBase) ?? ""}
                alt={`${mitra.kendaraan.merek} ${mitra.kendaraan.model}`}
                className="w-full h-48 object-cover"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              {mitra.kendaraan.warna} · {mitra.kendaraan.merek} {mitra.kendaraan.model} · {mitra.kendaraan.plat_nomor}
            </p>
          </div>
        )}

        {validationMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3" data-testid="validation-msg">
            {validationMsg}
          </div>
        )}

        {isOwnCarter && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3">
            Ini Carter Anda sendiri — tidak bisa booking sebagai penumpang.
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 pb-4 pt-3 bg-gradient-to-t from-background via-background to-background/0">
        <div className="bg-foreground text-card rounded-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-card/60 uppercase">Total Carter</p>
            <p className="text-lg font-extrabold" data-testid="total-amount">{formatRupiah(total)}</p>
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
        city={mitra.origin_city}
        title={`Jemput di ${mitra.origin_city}`}
        initialValue={pickup}
        onCancel={() => setPickupOpen(false)}
        onConfirm={(addr) => {
          setPickup(addr);
          setPickupOpen(false);
        }}
      />
      <MapPicker
        isOpen={dropoffOpen}
        city={dest}
        title={`Antar ke ${dest}`}
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
