import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, MapPin, Navigation, Ticket, Loader2, ExternalLink, CheckCircle2, Clock4, Car, Navigation2, LocateFixed, MessageCircle, Phone, Star, XCircle, Camera } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { driverIcon, pickupIcon } from "@/components/mapIcons";
import { getDriverPhotoUrl } from "@/lib/utils";
import { PhotoLightbox } from "@/components/photo-lightbox";

function MapAutoFit({ driverLat, driverLng, pickupLat, pickupLng }: { driverLat: number; driverLng: number; pickupLat: number | null; pickupLng: number | null }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [[driverLat, driverLng]];
    if (pickupLat && pickupLng) pts.push([pickupLat, pickupLng]);
    if (pts.length === 2) map.fitBounds(pts, { padding: [40, 40] });
    else map.setView(pts[0], 15);
  }, [driverLat, driverLng, pickupLat, pickupLng, map]);
  return null;
}

type TripProgress = "menunggu" | "menuju_jemput" | "dalam_perjalanan" | "selesai";

interface CarterBooking {
  id: number;
  settings_id: number;
  penumpang_id: number;
  origin_city: string;
  destination_city: string;
  travel_date: string;
  travel_time: string;
  pickup_label: string;
  pickup_detail: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_label: string;
  dropoff_detail: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  total_amount: number;
  payment_method: "qris" | "transfer" | "ewallet";
  payment_proof_url: string | null;
  status: string;
  trip_progress: TripProgress;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_location_updated_at: string | null;
  created_at: string;
  is_mitra: boolean;
  driver: { id: number; nama: string; foto_profil: string | null; no_whatsapp: string | null } | null;
  kendaraan: { id: number; merek: string; model: string; plat_nomor: string; warna: string; foto_url: string | null } | null;
  pickup_confirmed_at: string | null;
  dropoff_confirmed_at: string | null;
  my_rating: { stars: number; comment: string | null } | null;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function longDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function bookingCode(id: number) {
  return "CARTER-" + String(id).padStart(6, "0");
}
function statusInfo(status: string, tp: TripProgress, pickupConfirmed?: boolean): { label: string; tone: string; Icon: typeof CheckCircle2 } {
  if (tp === "menuju_jemput" && pickupConfirmed) return { label: "Sudah jemput — menunggu berangkat", tone: "bg-violet-100 text-violet-800", Icon: CheckCircle2 };
  if (tp === "menuju_jemput") return { label: "Mitra sedang menuju lokasi jemput", tone: "bg-blue-100 text-blue-800", Icon: Navigation2 };
  if (tp === "dalam_perjalanan") return { label: "Sedang dalam perjalanan", tone: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 };
  if (tp === "selesai" || status === "selesai") return { label: "Perjalanan selesai", tone: "bg-muted text-muted-foreground", Icon: CheckCircle2 };
  if (status === "aktif") return { label: "Tiket aktif — menunggu mitra", tone: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 };
  switch (status) {
    case "paid": return { label: "Menunggu mitra menjemput", tone: "bg-amber-100 text-amber-800", Icon: Clock4 };
    case "batal": return { label: "Dibatalkan", tone: "bg-red-100 text-red-800", Icon: Clock4 };
    case "pending": return { label: "Menunggu pembayaran", tone: "bg-amber-100 text-amber-800", Icon: Clock4 };
    default: return { label: status, tone: "bg-muted text-muted-foreground", Icon: Clock4 };
  }
}
function mapLink(lat: number | null, lng: number | null, label: string) {
  if (lat == null || lng == null) return null;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}&label=${encodeURIComponent(label)}`;
}

function tripProgressBtn(tp: TripProgress): { label: string; next: TripProgress } | null {
  if (tp === "menunggu") return { label: "Mulai Jemput", next: "menuju_jemput" };
  if (tp === "menuju_jemput") return { label: "Penumpang Sudah Naik", next: "dalam_perjalanan" };
  if (tp === "dalam_perjalanan") return { label: "Selesaikan Perjalanan", next: "selesai" };
  return null;
}

export default function CarterEtiket() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/carter-booking/:id/etiket");
  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const { token, user } = useAuth();
  const backPath = user?.role === "driver" ? "/pesanan" : "/dashboard-penumpang";
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [booking, setBooking] = useState<CarterBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyProgress, setBusyProgress] = useState(false);
  const [gpsPermission, setGpsPermission] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");
  const [gpsActive, setGpsActive] = useState(false);
  const [driverPhotoError, setDriverPhotoError] = useState(false);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [confirmPickupBusy, setConfirmPickupBusy] = useState(false);
  const [confirmDropoffBusy, setConfirmDropoffBusy] = useState(false);
  const [showRating, setShowRating] = useState(false);

  const watchIdRef = useRef<number | null>(null);

  async function fetchBooking(silent = false) {
    if (!token || isNaN(id)) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${apiBase}/carter-bookings/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data: CarterBooking = await res.json();
        setBooking(data);
        setError(null);
      } else if (res.status === 401) {
        setLocation("/login");
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Gagal memuat tiket (${res.status}).`);
      }
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

  useEffect(() => {
    if (!booking?.is_mitra) return;
    if (!navigator.geolocation) { setGpsPermission("denied"); return; }
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((result) => {
      setGpsPermission(result.state as "granted" | "denied" | "prompt");
      result.onchange = () => setGpsPermission(result.state as "granted" | "denied" | "prompt");
    }).catch(() => {});
  }, [booking?.is_mitra]);

  function requestGpsPermission() {
    navigator.geolocation.getCurrentPosition(
      () => setGpsPermission("granted"),
      () => setGpsPermission("denied"),
      { enableHighAccuracy: true },
    );
  }

  useEffect(() => {
    if (!booking) return;
    const isActive = (booking.status === "aktif" || booking.status === "paid") && booking.trip_progress !== "selesai";

    if (booking.is_mitra && isActive) {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsActive(true);
          fetch(`${apiBase}/carter-bookings/${id}/driver-location`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
        },
        () => setGpsActive(false),
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
      return () => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setGpsActive(false);
        }
      };
    }

    if (!booking.is_mitra && isActive) {
      const interval = setInterval(() => fetchBooking(true), 1000);
      return () => clearInterval(interval);
    }
  }, [booking?.status, booking?.trip_progress, booking?.is_mitra]);

  useEffect(() => { setDriverPhotoError(false); }, [booking?.driver?.foto_profil]);

  async function advanceProgress() {
    if (!booking) return;
    const btn = tripProgressBtn(booking.trip_progress);
    if (!btn) return;
    setBusyProgress(true);
    try {
      const res = await fetch(`${apiBase}/carter-bookings/${id}/trip-progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trip_progress: btn.next }),
      });
      if (res.ok) await fetchBooking(true);
    } finally {
      setBusyProgress(false);
    }
  }

  async function confirmPickup() {
    if (!booking) return;
    setConfirmPickupBusy(true);
    try {
      const res = await fetch(`${apiBase}/carter-bookings/${id}/confirm-pickup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) await fetchBooking(true);
    } finally {
      setConfirmPickupBusy(false);
    }
  }

  async function confirmDropoff() {
    if (!booking) return;
    setConfirmDropoffBusy(true);
    try {
      const res = await fetch(`${apiBase}/carter-bookings/${id}/confirm-dropoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) await fetchBooking(true);
    } finally {
      setConfirmDropoffBusy(false);
    }
  }

  async function submitRating() {
    if (!booking || ratingStars === 0) return;
    setRatingBusy(true);
    try {
      const res = await fetch(`${apiBase}/carter-bookings/${id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stars: ratingStars, comment: ratingComment.trim() || undefined }),
      });
      if (res.ok) {
        setRatingDone(true);
        setShowRating(false);
        await fetchBooking(true);
      }
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
  if (error || !booking) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto p-6 text-center">
        <p className="text-sm font-bold text-foreground mt-12" data-testid="etiket-error">
          {error ?? "E-tiket tidak ditemukan."}
        </p>
        <button onClick={() => setLocation(backPath)} className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold">
          Ke beranda
        </button>
      </div>
    );
  }

  const si = statusInfo(booking.status, booking.trip_progress, !!booking.pickup_confirmed_at);
  const Icon = si.Icon;
  const code = bookingCode(booking.id);
  const tp = booking.trip_progress;
  const progressBtn = tripProgressBtn(tp);
  const showLiveMap = !booking.is_mitra && ["paid", "aktif"].includes(booking.status) && tp !== "selesai";
  const showMitraMap = booking.is_mitra && booking.status === "aktif" && booking.pickup_lat && booking.pickup_lng;

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      <div className="bg-card border-b border-border px-5 pt-10 pb-4 flex items-center gap-3">
        <button
          data-testid="back-btn"
          onClick={() => setLocation(backPath)}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">E-Tiket</h1>
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
              <span className="text-xs font-bold tracking-widest uppercase">Carter</span>
            </div>
            <span className="text-[10px] font-bold tracking-widest opacity-70">RUTE</span>
          </div>

          <div className="p-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Asal</p>
                <p className="text-lg font-extrabold text-foreground" data-testid="etiket-asal">{booking.origin_city}</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-[10px] text-muted-foreground">Berangkat</p>
                <p className="text-2xl font-extrabold text-accent" data-testid="etiket-jam">{booking.travel_time}</p>
                <p className="text-[10px] text-muted-foreground">{longDate(booking.travel_date)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Tujuan</p>
                <p className="text-lg font-extrabold text-foreground" data-testid="etiket-tujuan">{booking.destination_city}</p>
              </div>
            </div>

            <div className="my-4 border-t border-dashed border-border" />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Mitra</p>
                <div className="flex items-center gap-2 mt-1">
                  {(() => {
                    const driverPhotoUrl = getDriverPhotoUrl(apiBase, booking.driver?.foto_profil);
                    const showPhoto = !!driverPhotoUrl && !driverPhotoError;
                    return (
                      <button
                        type="button"
                        onClick={() => { if (showPhoto) setPhotoModal({ url: driverPhotoUrl!, name: booking.driver?.nama ?? "" }); }}
                        className={`w-8 h-8 rounded-full bg-amber-100 overflow-hidden flex items-center justify-center text-amber-800 font-bold text-xs flex-shrink-0 ${showPhoto ? "cursor-zoom-in" : "cursor-default"}`}
                      >
                        {showPhoto ? (
                          <img src={driverPhotoUrl!} alt={booking.driver!.nama} className="w-full h-full object-cover" onError={() => setDriverPhotoError(true)} />
                        ) : (
                          booking.driver?.nama?.[0]?.toUpperCase() ?? "?"
                        )}
                      </button>
                    );
                  })()}
                  <p className="font-bold text-foreground" data-testid="etiket-mitra">{booking.driver?.nama ?? "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Kendaraan</p>
                <p className="font-bold text-foreground">
                  {booking.kendaraan ? `${booking.kendaraan.merek} ${booking.kendaraan.model}` : "—"}
                </p>
                {booking.kendaraan && (
                  <p className="text-[11px] text-muted-foreground">{booking.kendaraan.plat_nomor} · {booking.kendaraan.warna}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Tipe</p>
                <p className="font-bold text-foreground">Carter</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Total Bayar</p>
                <p className="font-bold text-accent" data-testid="etiket-total">{formatRupiah(booking.total_amount)}</p>
              </div>
            </div>

            <div className="my-4 border-t border-dashed border-border" />

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Jemput</p>
                  <p className="text-sm font-bold text-foreground" data-testid="etiket-pickup">{booking.pickup_label}</p>
                  {booking.pickup_detail && <p className="text-[11px] text-muted-foreground">{booking.pickup_detail}</p>}
                  {mapLink(booking.pickup_lat, booking.pickup_lng, booking.pickup_label) && (
                    <a
                      href={mapLink(booking.pickup_lat, booking.pickup_lng, booking.pickup_label) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-accent flex items-center gap-1 mt-0.5"
                    >
                      Buka di peta <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Navigation className="w-3.5 h-3.5 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Antar</p>
                  <p className="text-sm font-bold text-foreground" data-testid="etiket-dropoff">{booking.dropoff_label}</p>
                  {booking.dropoff_detail && <p className="text-[11px] text-muted-foreground">{booking.dropoff_detail}</p>}
                  {mapLink(booking.dropoff_lat, booking.dropoff_lng, booking.dropoff_label) && (
                    <a
                      href={mapLink(booking.dropoff_lat, booking.dropoff_lng, booking.dropoff_label) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-accent flex items-center gap-1 mt-0.5"
                    >
                      Buka di peta <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/40 px-4 py-3 border-t border-dashed border-border">
            <div className="flex items-center justify-between">
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
        </div>

        {/* PENUMPANG: Live map posisi mitra */}
        {showLiveMap && (
          <div className="rounded-xl overflow-hidden border border-border">
            <div className="px-3 py-2 bg-muted/50 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              Lokasi Mitra (diperbarui setiap 1 detik)
              {booking.driver_location_updated_at && (
                <span className="ml-auto font-normal">
                  {new Date(booking.driver_location_updated_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
            </div>
            {booking.driver_lat && booking.driver_lng ? (
              <MapContainer
                center={[booking.driver_lat, booking.driver_lng]}
                zoom={14}
                style={{ height: "220px", width: "100%" }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapAutoFit
                  driverLat={booking.driver_lat}
                  driverLng={booking.driver_lng}
                  pickupLat={booking.pickup_lat}
                  pickupLng={booking.pickup_lng}
                />
                <Marker position={[booking.driver_lat, booking.driver_lng]} icon={driverIcon}>
                  <Popup>Mitra Driver</Popup>
                </Marker>
                {booking.pickup_lat && booking.pickup_lng && (
                  <Marker position={[booking.pickup_lat, booking.pickup_lng]} icon={pickupIcon}>
                    <Popup>Titik Jemput Anda</Popup>
                  </Marker>
                )}
              </MapContainer>
            ) : (
              <div className="h-24 flex items-center justify-center text-xs text-muted-foreground bg-muted/30">
                Menunggu mitra mengaktifkan lokasi…
              </div>
            )}
          </div>
        )}

        {/* MITRA: Navigasi ke titik jemput */}
        {showMitraMap && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${booking.pickup_lat},${booking.pickup_lng}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            <Car className="w-4 h-4" /> Navigasi ke Titik Jemput
          </a>
        )}

        {/* MITRA: GPS status banner */}
        {booking.is_mitra && booking.status === "aktif" && (
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium ${
            gpsPermission === "denied" ? "bg-red-100 text-red-700" :
            gpsActive ? "bg-green-100 text-green-700" :
            "bg-amber-100 text-amber-700"
          }`}>
            <LocateFixed className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1">
              {gpsPermission === "denied" && "Akses GPS ditolak. Aktifkan izin lokasi di pengaturan browser."}
              {gpsPermission === "granted" && gpsActive && "GPS aktif — lokasi Anda dibagikan ke penumpang."}
              {gpsPermission === "granted" && !gpsActive && "GPS diizinkan — akan aktif saat perjalanan dimulai."}
              {(gpsPermission === "prompt" || gpsPermission === "unknown") && "Izinkan akses GPS agar penumpang bisa melihat posisi Anda."}
            </span>
            {(gpsPermission === "prompt" || gpsPermission === "unknown") && (
              <button
                onClick={requestGpsPermission}
                className="bg-amber-600 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap"
              >
                Izinkan GPS
              </button>
            )}
          </div>
        )}

        {/* MITRA: Tombol progress perjalanan */}
        {booking.is_mitra && booking.status === "aktif" && progressBtn && (
          <button
            data-testid="progress-btn"
            onClick={advanceProgress}
            disabled={busyProgress}
            className="w-full py-3 rounded-xl bg-[#a85e28] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busyProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {progressBtn.label}
          </button>
        )}

        {booking.is_mitra && booking.status === "aktif" && tp === "selesai" && (
          <div className="w-full py-3 rounded-xl bg-green-50 text-green-700 text-sm font-bold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Perjalanan selesai
          </div>
        )}

        {/* PENUMPANG: Konfirmasi selesai + rating */}
        {!booking.is_mitra && (booking.status === "selesai" || tp === "selesai") && (
          <div className="flex flex-col gap-2">
            {/* Konfirmasi Trip Selesai */}
            {booking.dropoff_confirmed_at ? (
              <div className="w-full py-3 rounded-xl bg-green-50 text-green-700 text-sm font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Anda sudah mengonfirmasi tiba di tujuan
              </div>
            ) : (
              <button
                onClick={confirmDropoff}
                disabled={confirmDropoffBusy}
                className="w-full py-3 rounded-xl bg-green-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {confirmDropoffBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Konfirmasi Trip Selesai
              </button>
            )}

            {/* Beri Rating / Rating sudah dikirim */}
            {booking.my_rating || ratingDone ? (
              <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-col items-center gap-1">
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} className={`w-5 h-5 ${s <= (booking.my_rating?.stars ?? ratingStars) ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Terima kasih atas penilaian Anda!</span>
                {booking.my_rating?.comment && (
                  <span className="text-xs text-foreground italic">"{booking.my_rating.comment}"</span>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowRating(true)}
                className="w-full py-3 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 text-sm font-bold flex items-center justify-center gap-2"
              >
                <Star className="w-4 h-4" /> Beri Rating Mitra
              </button>
            )}
          </div>
        )}

        {/* Foto kendaraan */}
        {booking.kendaraan?.foto_url && (() => {
          const url = booking.kendaraan.foto_url!.startsWith("http") ? booking.kendaraan.foto_url! : `${apiBase}/storage${booking.kendaraan.foto_url!}`;
          const name = `${booking.kendaraan.merek} ${booking.kendaraan.model}`;
          return (
            <div>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1 mb-1.5">
                <Camera className="w-3 h-3" /> Foto Kendaraan
              </p>
              <button
                className="w-full rounded-2xl overflow-hidden border border-border cursor-zoom-in"
                onClick={() => setPhotoModal({ url, name })}
              >
                <img src={url} alt={name} className="w-full h-44 object-cover" />
              </button>
            </div>
          );
        })()}

        <div className="grid grid-cols-2 gap-2">
          <button
            data-testid="chat-mitra-btn"
            onClick={async () => {
              const r = await fetch(`${apiBase}/chat/threads`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                body: JSON.stringify({ booking_type: "carter", booking_id: booking.id }),
              });
              const j = await r.json();
              if (r.ok && j.id) setLocation(`/chat/${j.id}`);
            }}
            className="py-3 rounded-xl bg-[#a85e28] text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Chat {booking.is_mitra ? "Penumpang" : "Mitra"}
          </button>
          {!booking.is_mitra && (
            <a
              data-testid="telp-mitra-btn"
              href={booking.driver?.no_whatsapp ? `tel:${booking.driver.no_whatsapp}` : "#"}
              onClick={(e) => { if (!booking.driver?.no_whatsapp) e.preventDefault(); }}
              className={`py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${
                booking.driver?.no_whatsapp
                  ? "bg-emerald-600 text-white"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Phone className="w-4 h-4" /> Telp Mitra
            </a>
          )}
        </div>

        {/* PENUMPANG: Konfirmasi sudah dijemput */}
        {!booking.is_mitra && !booking.pickup_confirmed_at && ["menuju_jemput", "dalam_perjalanan"].includes(tp) && booking.status !== "batal" && (
          <button
            data-testid="confirm-pickup-btn"
            onClick={confirmPickup}
            disabled={confirmPickupBusy}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {confirmPickupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Konfirmasi Sudah Dijemput
          </button>
        )}
        {!booking.is_mitra && booking.pickup_confirmed_at && booking.status !== "batal" && (
          <div className="w-full py-3 rounded-xl bg-green-50 text-green-700 text-sm font-bold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Penjemputan sudah dikonfirmasi
          </div>
        )}

        {/* Batalkan Booking */}
        {!booking.is_mitra && ["pending", "paid"].includes(booking.status) && booking.trip_progress === "menunggu" && (
          <button
            data-testid="cancel-btn"
            onClick={() => setShowCancel(true)}
            className="w-full py-3 rounded-xl bg-red-50 text-red-700 text-sm font-bold flex items-center justify-center gap-2 border border-red-200"
          >
            <XCircle className="w-4 h-4" /> Batalkan Booking
          </button>
        )}

        <button
          data-testid="kembali-btn"
          onClick={() => setLocation(backPath)}
          className="w-full py-3 rounded-xl bg-muted text-foreground text-sm font-bold"
        >
          Kembali ke Beranda
        </button>
      </div>

      {/* Modal: Cancel confirmation */}
      {showCancel && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
          onClick={() => setShowCancel(false)}
        >
          <div
            className="bg-card rounded-t-3xl w-full max-w-md p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-foreground">Batalkan booking ini?</p>
            <p className="text-xs text-muted-foreground">
              Pembatalan hanya bisa dilakukan sebelum perjalanan aktif. Pengembalian dana diproses oleh admin.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setShowCancel(false)}
                className="py-3 rounded-xl bg-muted text-foreground text-sm font-bold"
              >
                Batal
              </button>
              <button
                data-testid="cancel-confirm-btn"
                disabled={cancelBusy}
                onClick={async () => {
                  setCancelBusy(true);
                  const r = await fetch(`${apiBase}/carter-bookings/${booking.id}/cancel`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (r.ok) {
                    setShowCancel(false);
                    await fetchBooking();
                  } else {
                    const j = await r.json().catch(() => ({}));
                    alert(j.error ?? "Gagal membatalkan booking.");
                  }
                  setCancelBusy(false);
                }}
                className="py-3 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {cancelBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Ya, Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {showRating && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
          onClick={() => setShowRating(false)}
        >
          <div
            className="bg-card rounded-t-3xl w-full max-w-md p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-foreground text-center">Bagaimana perjalanan Anda?</p>
            <div className="flex justify-center gap-2">
              {[1,2,3,4,5].map(s => (
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
              onChange={e => setRatingComment(e.target.value)}
              placeholder="Komentar (opsional)..."
              rows={3}
              className="w-full text-sm rounded-xl border border-amber-200 bg-muted px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setShowRating(false)}
                className="py-3 rounded-xl bg-muted text-foreground text-sm font-bold"
              >
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
        <PhotoLightbox
          url={photoModal.url}
          name={photoModal.name}
          onClose={() => setPhotoModal(null)}
        />
      )}
    </div>
  );
}
