import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Ticket,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Clock4,
  MessageCircle,
  Phone,
  Star,
  XCircle,
  Send,
  LocateFixed,
} from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { getDriverPhotoUrl } from "@/lib/utils";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/contexts/auth";
import { driverIcon, pickupIcon } from "@/components/mapIcons";

function MapAutoFit({ driverLat, driverLng, pickupLat, pickupLng }: {
  driverLat: number | null; driverLng: number | null;
  pickupLat: number | null; pickupLng: number | null;
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    if (driverLat && driverLng) pts.push([driverLat, driverLng]);
    if (pickupLat && pickupLng) pts.push([pickupLat, pickupLng]);
    if (pts.length === 2) map.fitBounds(pts, { padding: [40, 40] });
    else if (pts.length === 1) map.setView(pts[0], 15);
  }, [driverLat, driverLng, pickupLat, pickupLng, map]);
  return null;
}

type TripProgress =
  | "belum_jemput"
  | "sudah_jemput"
  | "dalam_perjalanan"
  | "selesai"
  | string;

interface Booking {
  id: number;
  schedule_id: number;
  kursi: string[];
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
  pickup_confirmed_at: string | null;
  dropoff_confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  schedule: {
    id: number;
    origin_city: string;
    destination_city: string;
    departure_date: string;
    departure_time: string;
    trip_progress: TripProgress;
    driver_lat: number | null;
    driver_lng: number | null;
    driver_location_updated_at: string | null;
  } | null;
  driver: { id: number; nama: string; no_whatsapp: string | null; foto_profil: string | null } | null;
  kendaraan: {
    id: number;
    merek: string;
    model: string;
    plat_nomor: string;
    warna: string;
  } | null;
  is_mitra: boolean;
  can_cancel: boolean;
  already_rated: boolean;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function longDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function bookingCode(id: number) {
  return "RUTE-" + String(id).padStart(6, "0");
}

function deriveStage(b: Booking): {
  label: string;
  tone: string;
  Icon: typeof CheckCircle2;
} {
  if (b.status === "batal")
    return {
      label: "Pesanan dibatalkan",
      tone: "bg-red-100 text-red-800",
      Icon: XCircle,
    };
  if (b.status === "pending")
    return {
      label: "Menunggu pembayaran",
      tone: "bg-amber-100 text-amber-800",
      Icon: Clock4,
    };
  const tp = b.schedule?.trip_progress ?? "belum_jemput";
  if (b.status === "selesai" || tp === "selesai")
    return {
      label: "Trip selesai",
      tone: "bg-green-100 text-green-800",
      Icon: CheckCircle2,
    };
  if (tp === "dalam_perjalanan")
    return {
      label: "Dalam perjalanan ke tujuan",
      tone: "bg-indigo-100 text-indigo-800",
      Icon: Navigation,
    };
  if (tp === "sudah_jemput")
    return {
      label: "Mitra sudah menjemput Anda",
      tone: "bg-blue-100 text-blue-800",
      Icon: CheckCircle2,
    };
  // status paid|aktif but trip_progress belum_jemput
  return {
    label: "Menunggu mitra menjemput",
    tone: "bg-amber-100 text-amber-800",
    Icon: Clock4,
  };
}

function mapLink(lat: number | null, lng: number | null, label: string) {
  if (lat == null || lng == null) return null;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}&label=${encodeURIComponent(label)}`;
}

export default function BookingEtiket() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/booking/:id/etiket");
  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const { token } = useAuth();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);
  const [driverPhotoError, setDriverPhotoError] = useState(false);

  const [gpsStatus, setGpsStatus] = useState<"idle" | "active" | "error">("idle");
  const [gpsPermission, setGpsPermission] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");
  const watcherRef = useRef<number | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || isNaN(id)) return;
      try {
        const res = await fetch(`${apiBase}/bookings/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal,
        });
        if (res.ok) {
          const data: Booking = await res.json();
          setBooking(data);
          setError(null);
        } else if (res.status === 404) {
          setError("E-tiket tidak ditemukan.");
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          // ignore transient
        }
      }
    },
    [apiBase, id, token],
  );

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    if (isNaN(id)) {
      setError("ID booking tidak valid.");
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    load(ctrl.signal).finally(() => setLoading(false));
    const t = setInterval(() => {
      load();
    }, 1000);
    return () => {
      ctrl.abort();
      clearInterval(t);
    };
  }, [token, id, apiBase, load, setLocation]);

  useEffect(() => { setDriverPhotoError(false); }, [id]);
  useEffect(() => { setDriverPhotoError(false); }, [booking?.driver?.foto_profil]);

  // Proactive GPS permission check for mitra
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

  // Driver GPS sharing: watch position when trip is active
  useEffect(() => {
    if (!booking?.is_mitra) return;
    const tp = booking.schedule?.trip_progress;
    const scheduleId = booking.schedule?.id;
    const isActive = tp === "belum_jemput" || tp === "sudah_jemput" || tp === "dalam_perjalanan";
    if (!isActive || !scheduleId || !token) return;

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    watcherRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setGpsStatus("active");
        try {
          await fetch(`${apiBase}/schedules/${scheduleId}/driver-location`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
        } catch (_) {}
      },
      () => setGpsStatus("error"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    return () => {
      if (watcherRef.current !== null) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
        setGpsStatus("idle");
      }
    };
  }, [booking?.is_mitra, booking?.schedule?.trip_progress, booking?.schedule?.id, token, apiBase]);

  async function callAction(
    label: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<boolean> {
    if (!token) return false;
    setBusyAction(label);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error ?? `Gagal: ${res.status}`);
        return false;
      }
      await load();
      return true;
    } catch (e: any) {
      setActionError(`Gagal: ${e.message ?? e}`);
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function openChat() {
    if (!booking || !token) return;
    setBusyAction("chat");
    try {
      const r = await fetch(`${apiBase}/chat/threads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ booking_type: "schedule", booking_id: booking.id }),
      });
      const j = await r.json();
      if (r.ok && j.id) setLocation(`/chat/${j.id}`);
    } finally {
      setBusyAction(null);
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
        <p
          className="text-sm font-bold text-foreground mt-12"
          data-testid="etiket-error"
        >
          {error ?? "E-tiket tidak ditemukan."}
        </p>
        <button
          onClick={() => setLocation("/dashboard-penumpang")}
          className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold"
        >
          Ke beranda
        </button>
      </div>
    );
  }

  const stage = deriveStage(booking);
  const Icon = stage.Icon;
  const code = bookingCode(booking.id);
  const tp = booking.schedule?.trip_progress ?? "belum_jemput";
  const showConfirmPickup =
    !booking.is_mitra &&
    !booking.pickup_confirmed_at &&
    ["sudah_jemput", "dalam_perjalanan", "selesai"].includes(tp) &&
    booking.status !== "batal";
  const showConfirmDropoff =
    !booking.is_mitra &&
    !booking.dropoff_confirmed_at &&
    tp === "selesai" &&
    booking.status !== "batal";
  const showRatingBtn =
    !booking.is_mitra &&
    booking.status === "selesai" &&
    !booking.already_rated;

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      <div className="bg-card border-b border-border px-5 pt-10 pb-4 flex items-center gap-3">
        <button
          data-testid="back-btn"
          onClick={() => setLocation("/dashboard-penumpang")}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">E-Tiket</h1>
          <p className="text-xs text-muted-foreground" data-testid="booking-code">
            {code}
          </p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-3">
        {/* Status */}
        <div
          className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${stage.tone}`}
          data-testid="booking-status"
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">{stage.label}</p>
        </div>

        {actionError && (
          <div
            className="bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2"
            data-testid="action-error"
          >
            {actionError}
          </div>
        )}

        {/* Tiket card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="bg-foreground text-card px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4" />
              <span className="text-xs font-bold tracking-widest uppercase">
                Jadwal Tetap
              </span>
            </div>
            <span className="text-[10px] font-bold tracking-widest opacity-70">
              RUTE
            </span>
          </div>

          <div className="p-4">
            {booking.schedule && (
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Asal
                  </p>
                  <p
                    className="text-lg font-extrabold text-foreground"
                    data-testid="etiket-asal"
                  >
                    {booking.schedule.origin_city}
                  </p>
                </div>
                <div className="text-center flex-1">
                  <p className="text-[10px] text-muted-foreground">Berangkat</p>
                  <p
                    className="text-2xl font-extrabold text-accent"
                    data-testid="etiket-jam"
                  >
                    {booking.schedule.departure_time}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {longDate(booking.schedule.departure_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Tujuan
                  </p>
                  <p
                    className="text-lg font-extrabold text-foreground"
                    data-testid="etiket-tujuan"
                  >
                    {booking.schedule.destination_city}
                  </p>
                </div>
              </div>
            )}

            <div className="my-4 border-t border-dashed border-border" />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Mitra
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {(() => {
                    const driverPhotoUrl = getDriverPhotoUrl(apiBase, booking.driver?.foto_profil);
                    const showPhoto = !!driverPhotoUrl && !driverPhotoError;
                    return (
                      <button
                        type="button"
                        onClick={() => { if (showPhoto) setPhotoModal({ url: driverPhotoUrl!, name: booking.driver?.nama ?? "" }); }}
                        className={`w-8 h-8 rounded-full bg-amber-100 overflow-hidden flex items-center justify-center text-amber-800 font-bold text-xs flex-shrink-0 ${showPhoto ? "cursor-zoom-in" : "cursor-default"}`}
                        aria-label={showPhoto ? `Lihat foto ${booking.driver!.nama}` : undefined}
                      >
                        {showPhoto ? (
                          <img
                            src={driverPhotoUrl!}
                            alt={booking.driver!.nama}
                            className="w-full h-full object-cover"
                            onError={() => setDriverPhotoError(true)}
                          />
                        ) : (
                          booking.driver?.nama?.[0]?.toUpperCase() ?? "?"
                        )}
                      </button>
                    );
                  })()}
                  <p
                    className="font-bold text-foreground text-xs"
                    data-testid="etiket-mitra"
                  >
                    {booking.driver?.nama ?? "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Kendaraan
                </p>
                <p className="font-bold text-foreground">
                  {booking.kendaraan
                    ? `${booking.kendaraan.merek} ${booking.kendaraan.model}`
                    : "—"}
                </p>
                {booking.kendaraan && (
                  <p className="text-[11px] text-muted-foreground">
                    {booking.kendaraan.plat_nomor} · {booking.kendaraan.warna}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Kursi
                </p>
                <p
                  className="font-bold text-foreground"
                  data-testid="etiket-kursi"
                >
                  #{booking.kursi.join(", ")}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Total Bayar
                </p>
                <p
                  className="font-bold text-accent"
                  data-testid="etiket-total"
                >
                  {formatRupiah(booking.total_amount)}
                </p>
              </div>
            </div>

            <div className="my-4 border-t border-dashed border-border" />

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Jemput
                  </p>
                  <p
                    className="text-sm font-bold text-foreground"
                    data-testid="etiket-pickup"
                  >
                    {booking.pickup_label}
                  </p>
                  {booking.pickup_detail && (
                    <p className="text-[11px] text-muted-foreground">
                      {booking.pickup_detail}
                    </p>
                  )}
                  {mapLink(
                    booking.pickup_lat,
                    booking.pickup_lng,
                    booking.pickup_label,
                  ) && (
                    <a
                      href={
                        mapLink(
                          booking.pickup_lat,
                          booking.pickup_lng,
                          booking.pickup_label,
                        ) ?? "#"
                      }
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
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Antar
                  </p>
                  <p
                    className="text-sm font-bold text-foreground"
                    data-testid="etiket-dropoff"
                  >
                    {booking.dropoff_label}
                  </p>
                  {booking.dropoff_detail && (
                    <p className="text-[11px] text-muted-foreground">
                      {booking.dropoff_detail}
                    </p>
                  )}
                  {mapLink(
                    booking.dropoff_lat,
                    booking.dropoff_lng,
                    booking.dropoff_label,
                  ) && (
                    <a
                      href={
                        mapLink(
                          booking.dropoff_lat,
                          booking.dropoff_lng,
                          booking.dropoff_label,
                        ) ?? "#"
                      }
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
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Kode Booking
                </p>
                <p className="text-base font-extrabold tracking-wider text-foreground">
                  {code}
                </p>
              </div>
              <div
                className="w-16 h-16 rounded-lg bg-card border-2 border-foreground flex items-center justify-center"
                aria-label="QR booking"
              >
                <div className="grid grid-cols-5 gap-[2px]">
                  {Array.from({ length: 25 }).map((_, i) => {
                    const seed = (booking.id * 7 + i * 13) % 5;
                    const filled = seed < 3;
                    return (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 ${filled ? "bg-foreground" : "bg-transparent"}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DRIVER: Navigasi ke Titik Jemput + GPS status */}
        {booking.is_mitra && booking.schedule && ["belum_jemput", "sudah_jemput", "dalam_perjalanan"].includes(booking.schedule.trip_progress) && (
          <div className="space-y-2">
            {booking.pickup_lat && booking.pickup_lng && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${booking.pickup_lat},${booking.pickup_lng}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2"
              >
                <Navigation className="w-4 h-4" />
                Navigasi ke Titik Jemput
              </a>
            )}
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium ${
              gpsPermission === "denied" ? "bg-red-100 text-red-700" :
              gpsStatus === "active" ? "bg-green-100 text-green-700" :
              "bg-amber-100 text-amber-700"
            }`}>
              <LocateFixed className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1">
                {gpsPermission === "denied" && "Akses GPS ditolak. Aktifkan izin lokasi di pengaturan browser."}
                {gpsPermission === "granted" && gpsStatus === "active" && "GPS aktif — lokasi Anda dibagikan ke penumpang."}
                {gpsPermission === "granted" && gpsStatus !== "active" && "GPS diizinkan — akan aktif saat perjalanan dimulai."}
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
          </div>
        )}

        {/* PENUMPANG: Live map driver */}
        {!booking.is_mitra && booking.schedule && ["belum_jemput", "sudah_jemput", "dalam_perjalanan"].includes(booking.schedule.trip_progress) && (
          <div className="rounded-xl overflow-hidden border border-border">
            <div className="px-3 py-2 bg-muted/50 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              Lokasi Mitra (diperbarui setiap 1 detik)
              {booking.schedule.driver_location_updated_at && (
                <span className="ml-auto font-normal">
                  {new Date(booking.schedule.driver_location_updated_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
            </div>
            {booking.schedule.driver_lat && booking.schedule.driver_lng ? (
              <MapContainer
                center={[booking.schedule.driver_lat, booking.schedule.driver_lng]}
                zoom={14}
                style={{ height: "220px", width: "100%" }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapAutoFit
                  driverLat={booking.schedule.driver_lat}
                  driverLng={booking.schedule.driver_lng}
                  pickupLat={booking.pickup_lat ?? null}
                  pickupLng={booking.pickup_lng ?? null}
                />
                <Marker position={[booking.schedule.driver_lat, booking.schedule.driver_lng]} icon={driverIcon}>
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
                Menunggu mitra mengaktifkan lokasi...
              </div>
            )}
          </div>
        )}

        {/* Quick action: chat & telp */}
        <div className="grid grid-cols-2 gap-2">
          <button
            data-testid="chat-mitra-btn"
            onClick={openChat}
            disabled={busyAction === "chat"}
            className="py-3 rounded-xl bg-[#a85e28] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busyAction === "chat" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4" />
            )}{" "}
            Chat {booking.is_mitra ? "Penumpang" : "Mitra"}
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

        {/* Konfirmasi sudah dijemput */}
        {showConfirmPickup && (
          <button
            data-testid="confirm-pickup-btn"
            onClick={() =>
              callAction("confirm-pickup", `/bookings/${booking.id}/confirm-pickup`)
            }
            disabled={busyAction === "confirm-pickup"}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busyAction === "confirm-pickup" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}{" "}
            Konfirmasi Sudah Dijemput
          </button>
        )}
        {booking.pickup_confirmed_at && !booking.is_mitra && (
          <p
            className="text-[11px] text-blue-700 text-center"
            data-testid="pickup-confirmed-note"
          >
            ✓ Anda mengonfirmasi sudah dijemput
          </p>
        )}

        {/* Konfirmasi trip selesai */}
        {showConfirmDropoff && (
          <button
            data-testid="confirm-dropoff-btn"
            onClick={() =>
              callAction("confirm-dropoff", `/bookings/${booking.id}/confirm-dropoff`)
            }
            disabled={busyAction === "confirm-dropoff"}
            className="w-full py-3 rounded-xl bg-green-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busyAction === "confirm-dropoff" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}{" "}
            Konfirmasi Trip Selesai
          </button>
        )}
        {booking.dropoff_confirmed_at && !booking.is_mitra && (
          <p
            className="text-[11px] text-green-700 text-center"
            data-testid="dropoff-confirmed-note"
          >
            ✓ Anda mengonfirmasi sudah sampai tujuan
          </p>
        )}

        {/* Beri Rating */}
        {showRatingBtn && (
          <button
            data-testid="rating-btn"
            onClick={() => setShowRating(true)}
            className="w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            <Star className="w-4 h-4" /> Beri Rating Mitra
          </button>
        )}
        {booking.already_rated && !booking.is_mitra && (
          <p
            className="text-[11px] text-muted-foreground text-center"
            data-testid="rating-done-note"
          >
            ✓ Anda sudah memberi rating
          </p>
        )}

        {/* Batalkan Booking */}
        {booking.can_cancel && (
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
          onClick={() => setLocation("/dashboard-penumpang")}
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
            data-testid="cancel-modal"
          >
            <p className="text-base font-bold text-foreground">
              Batalkan booking ini?
            </p>
            <p className="text-xs text-muted-foreground">
              Pembatalan hanya bisa dilakukan minimal 24 jam sebelum keberangkatan.
              Pengembalian dana diproses oleh admin.
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
                onClick={async () => {
                  const ok = await callAction(
                    "cancel",
                    `/bookings/${booking.id}/cancel`,
                  );
                  if (ok) setShowCancel(false);
                }}
                disabled={busyAction === "cancel"}
                className="py-3 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-60"
              >
                Ya, batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rating */}
      {showRating && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
          onClick={() => setShowRating(false)}
        >
          <div
            className="bg-card rounded-t-3xl w-full max-w-md p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
            data-testid="rating-modal"
          >
            <p className="text-base font-bold text-foreground">
              Beri rating untuk {booking.driver?.nama ?? "mitra"}
            </p>
            <div className="flex items-center justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  data-testid={`rating-star-${n}`}
                  onClick={() => setStars(n)}
                  className="p-1"
                  aria-label={`${n} bintang`}
                >
                  <Star
                    className={`w-8 h-8 ${
                      n <= stars
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            <textarea
              data-testid="rating-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tulis komentar (opsional)"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm bg-background"
              rows={3}
            />
            <button
              data-testid="rating-submit-btn"
              onClick={async () => {
                const ok = await callAction(
                  "rating",
                  `/bookings/${booking.id}/rating`,
                  { stars, comment: comment.trim() || null },
                );
                if (ok) {
                  setShowRating(false);
                  setComment("");
                }
              }}
              disabled={busyAction === "rating"}
              className="w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busyAction === "rating" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}{" "}
              Kirim Rating
            </button>
          </div>
        </div>
      )}

      {photoModal && (
        <PhotoLightbox url={photoModal.url} name={photoModal.name} onClose={() => setPhotoModal(null)} />
      )}
    </div>
  );
}
