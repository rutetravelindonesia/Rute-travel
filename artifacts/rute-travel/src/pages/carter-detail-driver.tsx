import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock4,
  Car,
  MessageCircle,
  Phone,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Circle,
  FileText,
  Banknote,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { pickupIcon, dropoffIcon } from "@/components/mapIcons";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/contexts/auth";
import { getDriverPhotoUrl } from "@/lib/utils";

type TripProgress = "menunggu" | "menuju_jemput" | "dalam_perjalanan" | "selesai";

interface CarterBookingDetail {
  id: number;
  origin_city: string;
  destination_city: string;
  travel_date: string;
  travel_time: string;
  total_amount: number;
  status: string;
  trip_progress: TripProgress;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_label: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  dropoff_label: string | null;
  catatan: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  penumpang: { id: number; nama: string; no_whatsapp: string | null; foto_profil: string | null } | null;
  kendaraan: {
    jenis: string; merek: string; model: string; warna: string; plat_nomor: string;
  } | null;
}

function MapFitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length >= 2) map.fitBounds(points, { padding: [40, 40] });
  }, [points.map(p => p.join(",")).join("|"), map]);
  return null;
}

function formatDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatRupiah(n: number) {
  return "Rp" + n.toLocaleString("id-ID");
}

function initials(nama: string) {
  return nama.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const STAGES: { key: TripProgress; label: string }[] = [
  { key: "menuju_jemput", label: "Menuju lokasi jemput penumpang" },
  { key: "dalam_perjalanan", label: "Dalam perjalanan ke kota tujuan" },
  { key: "selesai", label: "Selesai" },
];

function stageIndex(p: TripProgress) {
  if (p === "menunggu") return -1;
  if (p === "sudah_jemput") return 0;
  return STAGES.findIndex((s) => s.key === p);
}

function buttonLabel(p: TripProgress): string | null {
  if (p === "menunggu") return "Mulai Jemput Konsumen";
  if (p === "menuju_jemput") return "Penumpang Sudah Naik";
  if (p === "sudah_jemput") return "Berangkat ke Kota Tujuan";
  if (p === "dalam_perjalanan") return "Selesaikan Trip";
  return null;
}

function stageBadgeCls(status: string, tp: TripProgress) {
  if (status === "pending") return "bg-yellow-100 text-yellow-800";
  if (status === "batal") return "bg-red-100 text-red-800";
  if (status === "selesai" || tp === "selesai") return "bg-green-100 text-green-800";
  if (tp === "menuju_jemput") return "bg-blue-100 text-blue-800";
  if (tp === "dalam_perjalanan") return "bg-indigo-100 text-indigo-800";
  return "bg-amber-100 text-amber-800";
}

function stageBadgeLabel(status: string, tp: TripProgress) {
  if (status === "pending") return "Menunggu Pembayaran";
  if (status === "batal") return "Dibatalkan";
  if (status === "selesai" || tp === "selesai") return "Selesai";
  if (tp === "menuju_jemput") return "Menuju lokasi jemput penumpang";
  if (tp === "sudah_jemput") return "Menuju lokasi jemput penumpang";
  if (tp === "dalam_perjalanan") return "Dalam perjalanan ke kota tujuan";
  return "Menuju lokasi jemput penumpang";
}

export default function CarterDetailDriverPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/carter-booking/:id/driver-detail");
  const { token } = useAuth();
  const bookingId = params?.id ? Number(params.id) : null;

  const [data, setData] = useState<CarterBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTrip, setBusyTrip] = useState(false);
  const [busyChat, setBusyChat] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const gpsWatchRef = useRef<number | null>(null);

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  async function load() {
    if (!token || !bookingId) return;
    try {
      const res = await fetch(`${apiBase}/carter-bookings/${bookingId}`, {
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

  const ACTIVE_PROGRESS = new Set(["menuju_jemput", "sudah_jemput", "dalam_perjalanan"]);
  useEffect(() => {
    const tp = data?.trip_progress;
    const shouldTrack = !!token && !!bookingId && !!tp && ACTIVE_PROGRESS.has(tp);

    if (!shouldTrack || !navigator.geolocation) {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
        gpsWatchRef.current = null;
      }
      return;
    }

    if (gpsWatchRef.current !== null) return;

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        fetch(`${apiBase}/carter-bookings/${bookingId}/driver-location`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 3000 },
    );

    return () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
        gpsWatchRef.current = null;
      }
    };
  }, [token, bookingId, data?.trip_progress]);

  async function openChat() {
    if (!token || !bookingId) return;
    setBusyChat(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/chat/threads`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ booking_type: "carter", booking_id: bookingId }),
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

  function openPhone() {
    const noWa = data?.penumpang?.no_whatsapp;
    if (!noWa) { setActionError("Nomor penumpang tidak tersedia."); return; }
    window.location.href = `tel:${noWa}`;
  }

  async function advanceProgress() {
    if (!token || !bookingId || !data) return;
    setBusyTrip(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/carter-bookings/${bookingId}/trip-progress`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setActionError(`Gagal memperbarui status: ${e.message ?? e}`);
    } finally {
      setBusyTrip(false);
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

  const tp = data.trip_progress ?? "menunggu";
  const curStageIdx = stageIndex(tp);
  const btn = ["paid", "aktif", "confirmed"].includes(data.status) ? buttonLabel(tp) : null;
  const isDone = data.status === "selesai" || tp === "selesai";
  const nama = data.penumpang?.nama ?? "—";
  const hasMap = data.pickup_lat != null && data.pickup_lng != null;
  const carterBlockedByPayment = data.status === "paid" && (tp === "menunggu" || !tp);

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="bg-[#a85e28] text-white px-4 pt-12 pb-6">
        <button onClick={() => setLocation("/pesanan")} className="flex items-center gap-1 text-white/80 mb-3 text-sm">
          <ArrowLeft className="w-4 h-4" /> Pesanan
        </button>
        <p className="text-xs uppercase tracking-widest text-white/70 mb-1">Carter</p>
        <h1 className="text-xl font-bold leading-tight">{data.origin_city} → {data.destination_city}</h1>
        <div className="flex items-center gap-3 mt-2 text-white/80 text-sm">
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(data.travel_date)}</span>
          <span className="flex items-center gap-1"><Clock4 className="w-3.5 h-3.5" />{data.travel_time}</span>
        </div>
        <div className="mt-3">
          <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${stageBadgeCls(data.status, tp)}`}>
            {stageBadgeLabel(data.status, tp)}
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

        <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
          <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-3">Penumpang</p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-amber-800 overflow-hidden relative">
                <span>{initials(nama)}</span>
                {(() => {
                  const photoUrl = getDriverPhotoUrl(apiBase, data.penumpang?.foto_profil);
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
                {data.penumpang?.no_whatsapp && (
                  <p className="text-[11px] text-muted-foreground">{data.penumpang.no_whatsapp}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openChat}
                disabled={busyChat}
                className="w-10 h-10 rounded-full bg-amber-50 hover:bg-amber-100 flex items-center justify-center disabled:opacity-50 transition-colors"
                aria-label="Chat penumpang"
              >
                {busyChat ? <Loader2 className="w-4 h-4 text-amber-700 animate-spin" /> : <MessageCircle className="w-4 h-4 text-amber-700" />}
              </button>
              <button
                onClick={openPhone}
                className="w-10 h-10 rounded-full bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center transition-colors"
                aria-label="Telepon penumpang"
              >
                <Phone className="w-4 h-4 text-emerald-700" />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
          <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2">
            {tp === "dalam_perjalanan" ? "Titik Jemput (sudah dijemput)" : "Titik Jemput"}
          </p>
          {data.pickup_label ? (
            <div className="flex items-start gap-2 mb-3">
              <MapPin className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-foreground leading-snug">{data.pickup_label}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">Belum diisi penumpang.</p>
          )}
          {hasMap && !carterBlockedByPayment && (() => {
            const hasDropoff = tp === "dalam_perjalanan" && data.dropoff_lat != null && data.dropoff_lng != null;
            const fitPoints: [number, number][] = [[data.pickup_lat!, data.pickup_lng!]];
            if (hasDropoff) fitPoints.push([data.dropoff_lat!, data.dropoff_lng!]);
            return (
              <div className="rounded-xl overflow-hidden border border-border" style={{ height: 200 }}>
                <MapContainer
                  center={[data.pickup_lat!, data.pickup_lng!]}
                  zoom={15}
                  style={{ height: "100%", width: "100%" }}
                  zoomControl={false}
                  scrollWheelZoom={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <MapFitBounds points={fitPoints} />
                  <Marker position={[data.pickup_lat!, data.pickup_lng!]} icon={pickupIcon}>
                    <Popup>Titik Jemput</Popup>
                  </Marker>
                  {hasDropoff && (
                    <Marker position={[data.dropoff_lat!, data.dropoff_lng!]} icon={dropoffIcon}>
                      <Popup>{data.dropoff_label ?? "Tujuan Pengantaran"}</Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>
            );
          })()}
          {hasMap && tp !== "dalam_perjalanan" && (
            <button
              onClick={() => window.open(`https://www.google.com/maps?q=${data.pickup_lat},${data.pickup_lng}`, "_blank", "noopener,noreferrer")}
              disabled={carterBlockedByPayment}
              title={carterBlockedByPayment ? "Lokasi tersedia setelah pembayaran dikonfirmasi admin" : "Buka di Google Maps"}
              className="w-full mt-2.5 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <MapPin className="w-4 h-4" /> Buka di Google Maps
            </button>
          )}
          {tp === "dalam_perjalanan" && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(data.destination_city + ", Kalimantan Timur, Indonesia")}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-2.5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
            >
              <Navigation className="w-4 h-4" /> Navigasi ke {data.destination_city}
            </a>
          )}
        </div>

        {data.catatan && (
          <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Catatan Penumpang
            </p>
            <p className="text-sm text-foreground italic leading-relaxed">"{data.catatan}"</p>
          </div>
        )}

        {data.kendaraan && (
          <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2">Kendaraan</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Car className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">
                  {data.kendaraan.merek} {data.kendaraan.model}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {data.kendaraan.warna} · {data.kendaraan.plat_nomor}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
          <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5" /> Pembayaran
          </p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total Carter</p>
            <p className="text-base font-bold text-foreground">{formatRupiah(data.total_amount)}</p>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-sm text-muted-foreground">Status</p>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              data.status === "paid" ? "bg-amber-100 text-amber-800" :
              data.status === "confirmed" || data.status === "aktif" || data.status === "selesai" ? "bg-green-100 text-green-800" :
              data.status === "batal" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
            }`}>
              {data.status === "paid" ? "Menunggu konfirmasi admin" : data.status === "confirmed" || data.status === "aktif" ? "Lunas" : data.status === "selesai" ? "Selesai" : data.status === "batal" ? "Dibatalkan" : "Menunggu"}
            </span>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
          <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-3">Status Perjalanan</p>
          <div className="relative pl-4">
            {STAGES.map((stage, idx) => {
              const done = idx < curStageIdx;
              const active = idx === curStageIdx;
              return (
                <div key={stage.key} className="flex items-start gap-3 mb-3 last:mb-0">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-colors ${
                      done ? "bg-green-500 border-green-500" : active ? "bg-amber-600 border-amber-600" : "bg-white border-border"
                    }`}>
                      {done && <CheckCircle2 className="w-3 h-3 text-white" />}
                      {active && <Circle className="w-2 h-2 text-white fill-white" />}
                    </div>
                    {idx < STAGES.length - 1 && (
                      <div className={`w-0.5 h-6 mt-1 ${done ? "bg-green-400" : "bg-border"}`} />
                    )}
                  </div>
                  <div className="pt-0.5">
                    <p className={`text-sm font-semibold ${active ? "text-amber-700" : done ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                      {stage.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {carterBlockedByPayment && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <span className="text-amber-500 flex-shrink-0 text-sm leading-none mt-0.5">⚠</span>
            <p className="text-[11px] text-amber-800 leading-snug">
              Pembayaran penumpang belum dikonfirmasi admin. Tombol "Mulai Jemput" akan aktif setelah pembayaran dikonfirmasi.
            </p>
          </div>
        )}
        {btn ? (
          <button
            onClick={advanceProgress}
            disabled={busyTrip || carterBlockedByPayment}
            className="w-full py-4 rounded-2xl bg-[#a85e28] text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-[#92501f] disabled:opacity-60 transition-colors shadow-sm"
          >
            {busyTrip ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {btn}
          </button>
        ) : isDone ? (
          <div className="w-full py-4 rounded-2xl bg-green-50 text-green-700 font-bold text-base flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Perjalanan Selesai
          </div>
        ) : null}
      </div>
    </div>
  );
}
