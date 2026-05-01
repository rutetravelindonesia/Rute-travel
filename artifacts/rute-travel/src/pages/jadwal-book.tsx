import { useEffect, useState, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight, MapPin, Navigation, User, Car } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { resolvePhotoUrl } from "@/lib/photoUrl";
import MapPicker, { type PickedAddress } from "@/components/MapPicker";
import { PhotoLightbox } from "@/components/photo-lightbox";

interface WaypointStop {
  city: string;
  order_index: number;
  price_from_prev: number;
}

interface ScheduleDetail {
  id: number;
  driver_id: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  capacity: number;
  price_per_seat: number;
  status: string;
  seats_taken: string[];
  kursi_terisi: number;
  kursi_tersisa: number;
  waypoints: WaypointStop[];
  driver: { id: number; nama: string; foto_profil: string | null } | null;
  kendaraan: {
    id: number;
    jenis: string;
    merek: string;
    model: string;
    plat_nomor: string;
    warna: string;
    foto_url: string | null;
  } | null;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function longDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
}

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

function buildSeatLayout(capacity: number): { rowLabels: string[]; rows: string[][] } {
  if (capacity < 1) return { rowLabels: [], rows: [] };
  const front = ["1"];
  const restCount = Math.max(0, capacity - 1);
  const rear: string[][] = [];
  let n = 2;
  while (n <= capacity) {
    const row: string[] = [];
    for (let i = 0; i < 3 && n <= capacity; i++, n++) {
      row.push(String(n));
    }
    rear.push(row);
  }
  const rowLabels = ["Depan", ...rear.map((_, i) => (i === rear.length - 1 ? "Belakang" : `Tengah ${i + 1}`))];
  return { rowLabels, rows: [front, ...rear] };
}

export default function JadwalBook() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/jadwal/:id/book");
  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const { token, user } = useAuth();
  const { toast } = useToast();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [pickup, setPickup] = useState<PickedAddress | null>(null);
  const [dropoff, setDropoff] = useState<PickedAddress | null>(null);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [dropoffOpen, setDropoffOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alightingCity, setAlightingCity] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    if (isNaN(id)) {
      setError("ID jadwal tidak valid.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/schedules/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) setError(err.error ?? "Gagal memuat jadwal.");
          return;
        }
        const data: ScheduleDetail = await res.json();
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setError("Gagal memuat jadwal.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, id, apiBase]);

  const isOwnSchedule = detail && user && detail.driver_id === user.id;
  const layout = detail ? buildSeatLayout(detail.capacity) : { rowLabels: [], rows: [] };

  const toggleSeat = (k: string) => {
    if (!detail) return;
    if (detail.seats_taken.includes(k)) return;
    setSelectedSeats((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const hasWaypoints = !!detail && detail.waypoints && detail.waypoints.length > 0;

  const fullRoute: string[] = useMemo(() => {
    if (!detail) return [];
    if (!hasWaypoints) return [detail.origin_city, detail.destination_city];
    const wps = [...detail.waypoints].sort((a, b) => a.order_index - b.order_index);
    return [detail.origin_city, ...wps.map((w) => w.city), detail.destination_city];
  }, [detail, hasWaypoints]);

  const segmentPrice = useMemo(() => {
    if (!detail || !hasWaypoints || !alightingCity) return detail?.price_per_seat ?? 0;
    const wps = [...detail.waypoints].sort((a, b) => a.order_index - b.order_index);
    const stops = [detail.origin_city, ...wps.map((w) => w.city)];
    const prices = wps.map((w) => w.price_from_prev);
    const aIdx = stops.indexOf(alightingCity);
    if (aIdx <= 0) return detail.price_per_seat;
    return prices.slice(0, aIdx).reduce((s, p) => s + p, 0);
  }, [detail, hasWaypoints, alightingCity]);

  const pricePerSeat = hasWaypoints && alightingCity ? segmentPrice : (detail?.price_per_seat ?? 0);
  const total = selectedSeats.length * pricePerSeat;

  const canSubmit =
    !!detail &&
    !isOwnSchedule &&
    selectedSeats.length > 0 &&
    !!pickup &&
    !!dropoff &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !detail || !pickup || !dropoff) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/schedules/${detail.id}/book`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kursi: selectedSeats,
          pickup,
          dropoff,
          payment_method: "transfer",
          alighting_city: hasWaypoints && alightingCity ? alightingCity : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal membuat pesanan.");
      }
      const created: { id: number } = await res.json();
      toast({ title: "Pesanan dibuat", description: "Lanjutkan ke pembayaran." });
      setLocation(`/booking/${created.id}/bayar`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto p-6 text-center">
        <p className="text-sm font-bold text-foreground mt-12">{error ?? "Jadwal tidak ditemukan."}</p>
        <button
          onClick={() => setLocation("/cari")}
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
          <h1 className="text-base font-bold text-foreground">Konfirmasi Booking</h1>
          <p className="text-xs text-muted-foreground">Jadwal Tetap · {detail.driver?.nama ?? "Mitra"}</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Mitra card */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => detail.driver?.foto_profil && setPhotoModal({ url: resolvePhotoUrl(detail.driver.foto_profil, apiBase) ?? "", name: detail.driver.nama })}
                className={`w-11 h-11 rounded-full flex-shrink-0 overflow-hidden ${detail.driver?.foto_profil ? "cursor-pointer" : "cursor-default"}`}
              >
                {detail.driver?.foto_profil ? (
                  <img src={resolvePhotoUrl(detail.driver.foto_profil, apiBase) ?? ""} alt={detail.driver.nama} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-accent text-white flex items-center justify-center font-bold text-sm">
                    {detail.driver ? initials(detail.driver.nama) : <User className="w-5 h-5" />}
                  </div>
                )}
              </button>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate" data-testid="mitra-nama">
                  {detail.driver?.nama ?? "—"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {detail.kendaraan
                    ? `${detail.kendaraan.merek} ${detail.kendaraan.model} · ${detail.kendaraan.plat_nomor}`
                    : "Kendaraan belum diatur"}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xl font-extrabold text-accent" data-testid="jam-berangkat">{detail.departure_time}</p>
              <p className="text-[10px] text-muted-foreground">{longDate(detail.departure_date)}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-border flex items-center justify-between">
            <p className="text-sm font-bold text-foreground" data-testid="rute-asal">{detail.origin_city}</p>
            <div className="flex-1 mx-2 border-t border-dotted border-border" />
            <p className="text-sm font-bold text-foreground" data-testid="rute-tujuan">{detail.destination_city}</p>
          </div>
          {hasWaypoints && (
            <div className="mt-2 flex flex-wrap gap-1">
              {fullRoute.map((city, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  {i > 0 && <span>›</span>}
                  <span className="bg-muted px-1.5 py-0.5 rounded-full">{city}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pilih Segmen — hanya tampil jika ada waypoints */}
        {hasWaypoints && (
          <div className="bg-card rounded-2xl border border-accent/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-accent" />
              <p className="text-sm font-bold text-foreground">Turun Lebih Awal?</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Naik dari <span className="font-semibold text-foreground">{detail.origin_city}</span>. Pilih kota tujuan jika ingin turun sebelum {detail.destination_city} — harga menyesuaikan.
            </p>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Turun di</label>
              <select
                value={alightingCity}
                onChange={(e) => setAlightingCity(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">Tujuan akhir ({detail.destination_city})</option>
                {fullRoute.slice(1, -1).map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            {alightingCity && (
              <div className="bg-accent/5 rounded-xl p-3 border border-accent/20 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Harga segmen</p>
                  <p className="text-sm font-bold text-foreground">{detail.origin_city} → {alightingCity}</p>
                </div>
                <p className="text-base font-extrabold text-accent">{formatRupiah(segmentPrice)}<span className="text-[10px] font-normal text-muted-foreground"> /kursi</span></p>
              </div>
            )}
            {!alightingCity && (
              <div className="bg-muted/40 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Harga rute penuh</p>
                  <p className="text-sm font-bold text-foreground">{detail.origin_city} → {detail.destination_city}</p>
                </div>
                <p className="text-base font-extrabold text-accent">{formatRupiah(detail.price_per_seat)}<span className="text-[10px] font-normal text-muted-foreground"> /kursi</span></p>
              </div>
            )}
          </div>
        )}

        {/* Pilih Kursi */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-foreground">Pilih Kursi</p>
            {detail.kendaraan && (
              <p className="text-[11px] text-muted-foreground">{detail.kendaraan.merek} {detail.kendaraan.model}</p>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] mb-3">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border-2 border-border bg-background" /> Kosong
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-accent" /> Pilihan
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-muted-foreground/40" /> Terisi
            </span>
          </div>
          <div className="bg-muted/40 rounded-2xl p-4">
            {/* Sopir + depan */}
            <div className="flex items-end justify-between gap-3 mb-1">
              <div className="flex flex-col items-center">
                <SeatBox
                  num="1"
                  state={
                    detail.seats_taken.includes("1")
                      ? "taken"
                      : selectedSeats.includes("1")
                      ? "selected"
                      : "free"
                  }
                  onClick={() => toggleSeat("1")}
                  testId="seat-1"
                />
                <span className="text-[9px] text-muted-foreground tracking-widest mt-1">DEPAN</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-xl bg-foreground text-card flex items-center justify-center text-xs font-bold">
                  <User className="w-4 h-4" />
                </div>
                <span className="text-[9px] text-muted-foreground tracking-widest mt-1">SOPIR</span>
              </div>
            </div>
            <div className="border-t border-dashed border-border my-3" />
            {/* Rear rows */}
            <div className="space-y-2">
              {layout.rows.slice(1).map((row, ri) => (
                <div key={ri} className="grid grid-cols-3 gap-2 justify-items-center">
                  {row.map((k) => (
                    <SeatBox
                      key={k}
                      num={k}
                      state={
                        detail.seats_taken.includes(k)
                          ? "taken"
                          : selectedSeats.includes(k)
                          ? "selected"
                          : "free"
                      }
                      onClick={() => toggleSeat(k)}
                      testId={`seat-${k}`}
                    />
                  ))}
                  {/* pad cells if last row has < 3 */}
                  {row.length < 3 &&
                    Array.from({ length: 3 - row.length }).map((_, i) => <span key={`pad-${i}`} />)}
                </div>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground tracking-widest mt-3 text-center">BAGASI</p>
          </div>
        </div>

        {/* Titik Jemput & Antar */}
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
                Jemput di {detail.origin_city}
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
                Antar ke {alightingCity || detail.destination_city}
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
        {detail.kendaraan?.foto_url && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Car className="w-4 h-4 text-accent" />
              <p className="text-sm font-bold text-foreground">Foto Kendaraan</p>
            </div>
            <div className="rounded-xl overflow-hidden bg-muted">
              <img
                src={resolvePhotoUrl(detail.kendaraan.foto_url, apiBase) ?? ""}
                alt={`${detail.kendaraan.merek} ${detail.kendaraan.model}`}
                className="w-full h-48 object-cover"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              {detail.kendaraan.warna} · {detail.kendaraan.merek} {detail.kendaraan.model} · {detail.kendaraan.plat_nomor}
            </p>
          </div>
        )}

        {isOwnSchedule && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3">
            Ini jadwal Anda sendiri — tidak bisa booking sebagai penumpang.
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 pb-4 pt-3 bg-gradient-to-t from-background via-background to-background/0">
        <div className="bg-foreground text-card rounded-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-card/60 uppercase" data-testid="total-kursi">
              Total {selectedSeats.length} kursi {hasWaypoints && alightingCity ? `· s/d ${alightingCity}` : ""}
            </p>
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
        city={detail.origin_city}
        title={`Jemput di ${detail.origin_city}`}
        initialValue={pickup}
        onCancel={() => setPickupOpen(false)}
        onConfirm={(addr) => { setPickup(addr); setPickupOpen(false); }}
      />
      <MapPicker
        isOpen={dropoffOpen}
        city={alightingCity || detail.destination_city}
        title={`Antar ke ${alightingCity || detail.destination_city}`}
        initialValue={dropoff}
        onCancel={() => setDropoffOpen(false)}
        onConfirm={(addr) => { setDropoff(addr); setDropoffOpen(false); }}
      />
      {photoModal && (
        <PhotoLightbox url={photoModal.url} name={photoModal.name} onClose={() => setPhotoModal(null)} />
      )}
    </div>
  );
}

function SeatBox({
  num,
  state,
  onClick,
  testId,
}: {
  num: string;
  state: "free" | "selected" | "taken";
  onClick: () => void;
  testId: string;
}) {
  const cls =
    state === "taken"
      ? "bg-muted-foreground/40 text-card cursor-not-allowed"
      : state === "selected"
      ? "bg-accent text-white"
      : "bg-card border-2 border-border text-foreground hover:bg-muted";
  return (
    <button
      type="button"
      data-testid={testId}
      data-state={state}
      onClick={onClick}
      disabled={state === "taken"}
      className={`w-12 h-12 rounded-xl text-sm font-bold flex items-center justify-center transition-colors ${cls}`}
    >
      {num}
    </button>
  );
}
