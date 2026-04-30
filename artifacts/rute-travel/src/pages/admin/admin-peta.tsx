import { useEffect, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { LocateFixed, RefreshCw, AlertCircle, Car } from "lucide-react";
import AdminLayout from "@/pages/admin/admin-layout";
import { useAuth } from "@/contexts/auth";
import { driverIcon, pickupIcon, dropoffIcon } from "@/components/mapIcons";
import "leaflet/dist/leaflet.css";

const EAST_KALIMANTAN_CENTER: [number, number] = [-0.5, 117.1];
const REFRESH_INTERVAL_MS = 30_000;

interface Penumpang {
  booking_id: number;
  nama: string;
  kursi: string[];
  status: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_label: string;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  dropoff_label: string;
}

interface ActiveSchedule {
  id: number;
  driver: { id: number; nama: string } | null;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_location_updated_at: string | null;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  trip_progress: string;
  penumpang: Penumpang[];
}

function secondsAgo(isoString: string | null): string {
  if (!isoString) return "tidak diketahui";
  const secs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (secs < 60) return `${secs} detik lalu`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} menit lalu`;
  return `${Math.floor(mins / 60)} jam lalu`;
}

export default function AdminPetaPage() {
  const { token } = useAuth();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [schedules, setSchedules] = useState<ActiveSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [secondsSince, setSecondsSince] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLokasi = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/admin/lokasi`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Gagal memuat data lokasi");
      const data: ActiveSchedule[] = await res.json();
      setSchedules(data);
      setLastRefreshed(new Date());
      setSecondsSince(0);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }, [token, apiBase]);

  useEffect(() => {
    fetchLokasi();
    intervalRef.current = setInterval(fetchLokasi, REFRESH_INTERVAL_MS);
    tickRef.current = setInterval(() => setSecondsSince(s => s + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [fetchLokasi]);

  const withCoords = schedules.filter(s => s.driver_lat && s.driver_lng);
  const noCoords = schedules.filter(s => !s.driver_lat || !s.driver_lng);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-foreground">Peta Lokasi Live</h1>
            <p className="text-sm text-muted-foreground">
              Pemantauan driver yang sedang aktif dalam perjalanan
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span className="text-xs text-muted-foreground">
                Diperbarui {secondsSince}d lalu
              </span>
            )}
            <button
              onClick={() => { setLoading(true); fetchLokasi(); }}
              className="flex items-center gap-1.5 text-xs bg-white border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Perbarui
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Driver Aktif" value={schedules.length} sub="sedang dalam perjalanan" />
          <StatCard label="Ada Koordinat" value={withCoords.length} sub="terlihat di peta" />
          <StatCard
            label="Total Penumpang"
            value={schedules.reduce((s, sc) => s + sc.penumpang.length, 0)}
            sub="terbooking aktif"
          />
          <StatCard label="Auto-refresh" value="30d" sub="sekali" />
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <LocateFixed className="w-4 h-4 text-amber-600" />
            <span className="font-semibold text-sm">Peta Interaktif</span>
            <span className="text-xs text-muted-foreground ml-auto">OpenStreetMap</span>
          </div>

          {loading ? (
            <div className="h-[420px] flex items-center justify-center text-muted-foreground text-sm">
              Memuat peta...
            </div>
          ) : (
            <MapContainer
              center={EAST_KALIMANTAN_CENTER}
              zoom={8}
              style={{ height: "420px", width: "100%" }}
              scrollWheelZoom
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />

              {schedules.map(sc => {
                if (!sc.driver_lat || !sc.driver_lng) return null;
                return (
                  <Marker
                    key={`driver-${sc.id}`}
                    position={[sc.driver_lat, sc.driver_lng]}
                    icon={driverIcon}
                  >
                    <Popup>
                      <div className="text-sm space-y-1 min-w-[180px]">
                        <p className="font-bold text-amber-700 flex items-center gap-1">
                          <Car className="w-3.5 h-3.5" />
                          {sc.driver?.nama ?? "Driver"}
                        </p>
                        <p className="text-xs text-gray-600 font-medium">
                          {sc.origin_city} → {sc.destination_city}
                        </p>
                        <p className="text-xs text-gray-500">
                          {sc.departure_date} · {sc.departure_time}
                        </p>
                        <p className="text-xs text-gray-500">
                          {sc.penumpang.length} penumpang aktif
                        </p>
                        {sc.driver_location_updated_at && (
                          <p className="text-[11px] text-gray-400 italic">
                            GPS: {secondsAgo(sc.driver_location_updated_at)}
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {schedules.flatMap(sc =>
                sc.penumpang.map(p => {
                  const markers = [];
                  if (p.pickup_lat && p.pickup_lng) {
                    markers.push(
                      <Marker
                        key={`pickup-${p.booking_id}`}
                        position={[p.pickup_lat, p.pickup_lng]}
                        icon={pickupIcon}
                      >
                        <Popup>
                          <div className="text-sm space-y-1">
                            <p className="font-bold text-green-700">Titik Jemput</p>
                            <p className="text-xs text-gray-700">{p.nama}</p>
                            <p className="text-xs text-gray-500">{p.pickup_label}</p>
                            <p className="text-xs text-gray-400">
                              {sc.origin_city} → {sc.destination_city}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  }
                  if (p.dropoff_lat && p.dropoff_lng) {
                    markers.push(
                      <Marker
                        key={`dropoff-${p.booking_id}`}
                        position={[p.dropoff_lat, p.dropoff_lng]}
                        icon={dropoffIcon}
                      >
                        <Popup>
                          <div className="text-sm space-y-1">
                            <p className="font-bold text-blue-700">Titik Antar</p>
                            <p className="text-xs text-gray-700">{p.nama}</p>
                            <p className="text-xs text-gray-500">{p.dropoff_label}</p>
                            <p className="text-xs text-gray-400">
                              {sc.origin_city} → {sc.destination_city}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  }
                  return markers;
                })
              )}
            </MapContainer>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
          <LegendDot color="bg-amber-500" label="Driver aktif" />
          <LegendDot color="bg-green-600" label="Titik jemput" />
          <LegendDot color="bg-blue-600" label="Titik antar" />
        </div>

        {schedules.length === 0 && !loading && !error && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            Tidak ada driver yang sedang aktif dalam perjalanan saat ini.
          </div>
        )}

        {withCoords.length < schedules.length && schedules.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <strong>{noCoords.length}</strong> driver aktif belum membagikan lokasi GPS dan tidak ditampilkan di peta.
          </div>
        )}

        {schedules.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-sm">Daftar Trip Aktif</h2>
            {schedules.map(sc => (
              <TripCard key={sc.id} sc={sc} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-full ${color} inline-block`} />
      {label}
    </span>
  );
}

function TripCard({ sc }: { sc: ActiveSchedule }) {
  return (
    <div className="bg-white rounded-xl border border-border px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">{sc.driver?.nama ?? "Driver #" + sc.id}</p>
          <p className="text-xs text-muted-foreground">
            {sc.origin_city} → {sc.destination_city} · {sc.departure_date} {sc.departure_time}
          </p>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sc.driver_lat && sc.driver_lng ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {sc.driver_lat && sc.driver_lng ? "GPS aktif" : "Tanpa GPS"}
        </span>
      </div>
      {sc.driver_location_updated_at && sc.driver_lat && sc.driver_lng && (
        <p className="text-[11px] text-muted-foreground">
          Posisi: {sc.driver_lat.toFixed(5)}, {sc.driver_lng.toFixed(5)} · GPS: {secondsAgo(sc.driver_location_updated_at)}
        </p>
      )}
      {sc.penumpang.length > 0 && (
        <div className="space-y-1 pt-1">
          {sc.penumpang.map(p => (
            <div key={p.booking_id} className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-medium text-foreground">{p.nama}</span>
              <span>Kursi {p.kursi.join(", ")}</span>
              {p.pickup_lat && <span className="text-green-600">✓ Jemput</span>}
              {p.dropoff_lat && <span className="text-blue-600">✓ Antar</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
