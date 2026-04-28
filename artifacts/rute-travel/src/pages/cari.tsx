import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowLeftRight, Calendar, Search } from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { RideCard } from "@/components/ride-card";
import { useAuth } from "@/contexts/auth";
import { KOTA_GROUPED } from "@/lib/kota";

interface JadwalResult {
  kind: "jadwal";
  id: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  price_per_seat: number;
  segment_price?: number;
  kursi_tersisa: number;
  waypoints?: { city: string; order_index: number; price_from_prev: number }[];
  driver: { id: number; nama: string; foto_profil: string | null } | null;
  kendaraan: { id: number; merek: string; model: string; warna: string; plat_nomor: string | null; foto_url: string | null } | null;
}

type AnyResult = JadwalResult;

function isToday(d: string) {
  const t = new Date().toISOString().split("T")[0];
  return d === t;
}

function getQueryParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export default function Cari() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const today = new Date().toISOString().split("T")[0];
  const initialParams = getQueryParams();
  const [origin, setOrigin] = useState(initialParams.get("from") ?? "");
  const [destination, setDestination] = useState(initialParams.get("to") ?? "");
  const [date, setDate] = useState(initialParams.get("date") ?? today);
  const [results, setResults] = useState<AnyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [driverRatings, setDriverRatings] = useState<Record<number, { avg: number; count: number }>>({});
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  const search = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setSearched(true);
    try {
      const qs = new URLSearchParams();
      if (origin) qs.set("origin_city", origin);
      if (destination) qs.set("destination_city", destination);
      if (date) qs.set("date", date);
      const headers = { Authorization: `Bearer ${token}` };
      const jRes = await fetch(`${apiBase}/schedules/search?${qs.toString()}`, { headers });
      const jArr: AnyResult[] = jRes.ok
        ? ((await jRes.json()) as JadwalResult[]).map((r) => ({ ...r, kind: "jadwal" as const }))
        : [];
      const merged = [...jArr].sort((a, b) => {
        const ka = `${a.departure_date}T${a.departure_time}`;
        const kb = `${b.departure_date}T${b.departure_time}`;
        return ka.localeCompare(kb);
      });
      setResults(merged);
    } finally {
      setLoading(false);
    }
  }, [origin, destination, date, token, apiBase]);

  useEffect(() => {
    if (!token || results.length === 0) return;
    const ids = Array.from(
      new Set(results.map((r) => r.driver?.id).filter((v): v is number => typeof v === "number")),
    ).filter((id) => !(id in driverRatings));
    if (ids.length === 0) return;
    let cancelled = false;
    Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`${apiBase}/users/${id}/rating-summary`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return null;
          const j = await res.json();
          return { id, avg: Number(j.avg) || 0, count: Number(j.count) || 0 };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setDriverRatings((prev) => {
        const next = { ...prev };
        for (const row of rows) if (row) next[row.id] = { avg: row.avg, count: row.count };
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [results, token, apiBase, driverRatings]);

  useEffect(() => {
    if (initialParams.get("from") || initialParams.get("to")) {
      search();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      <div className="flex items-center gap-3 px-5 pt-10 pb-3 bg-card border-b border-border">
        <button
          data-testid="back-btn"
          onClick={() => setLocation("/dashboard-penumpang")}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Cari Travel</h1>
          <p className="text-xs text-muted-foreground">Jadwal Tetap</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Dari</label>
              <select
                data-testid="search-origin"
                value={origin}
                onChange={(e) => { setOrigin(e.target.value); if (destination === e.target.value) setDestination(""); }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">Semua kota</option>
                {KOTA_GROUPED.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.kota.map((k) => <option key={k} value={k}>{k}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="flex justify-center -my-1">
              <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center">
                <ArrowLeftRight className="w-3.5 h-3.5 text-accent" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Ke</label>
              <select
                data-testid="search-destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">Semua kota</option>
                {KOTA_GROUPED.map((g) => {
                  const filtered = g.kota.filter((k) => k !== origin);
                  if (filtered.length === 0) return null;
                  return (
                    <optgroup key={g.label} label={g.label}>
                      {filtered.map((k) => <option key={k} value={k}>{k}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Tanggal</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  data-testid="search-date"
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div className="flex gap-1.5 mt-2">
                {[
                  { label: "Hari ini", value: today },
                  { label: "Besok", value: new Date(Date.now() + 86400000).toISOString().split("T")[0] },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDate(opt.value)}
                    data-testid={`quick-${opt.label.replace(/\s/g, "-").toLowerCase()}`}
                    className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                      date === opt.value ? "bg-accent text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            data-testid="search-btn"
            onClick={search}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            {loading ? "Mencari..." : "Cari Travel"}
          </button>
        </div>

        <div className="space-y-3 pt-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
            </div>
          ) : !searched ? (
            <p className="text-center text-xs text-muted-foreground py-8">
              Pilih rute & tanggal lalu tekan <span className="font-semibold">Cari Travel</span>.
            </p>
          ) : results.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm font-semibold text-foreground">Belum ada hasil</p>
              <p className="text-xs text-muted-foreground mt-1">
                Coba ubah tanggal atau rute. Mitra terus-menerus membuka jadwal baru.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground" data-testid="results-count">{results.length} hasil ditemukan</p>
              {results.map((r) => {
                const driverInitial = r.driver?.nama?.[0]?.toUpperCase() ?? "?";
                const driverFoto = r.driver?.foto_profil
                  ? `${apiBase}/storage${r.driver.foto_profil}`
                  : null;
                const rating = r.driver ? driverRatings[r.driver.id] : undefined;
                const vehicleLine = r.kendaraan ? (
                  <>
                    {r.kendaraan.merek} {r.kendaraan.model}
                    {r.kendaraan.plat_nomor ? <span className="font-medium text-foreground"> · {r.kendaraan.plat_nomor}</span> : ""}
                    {r.kendaraan.warna ? <span> · {r.kendaraan.warna}</span> : ""}
                  </>
                ) : null;
                // Kota singgah = semua waypoint kecuali kota tujuan akhir
                const stopovers = (r.waypoints ?? [])
                  .filter((wp) => wp.city !== r.destination_city)
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((wp) => wp.city);
                return (
                  <RideCard
                    key={`${r.kind}-${r.id}`}
                    variant="ride"
                    testId={`result-${r.kind}-${r.id}`}
                    onClick={() => setLocation(`/jadwal/${r.id}/book`)}
                    driverFoto={driverFoto}
                    driverInitial={driverInitial}
                    driverName={r.driver?.nama ?? ""}
                    onAvatarClick={driverFoto ? () => setPhotoModal({ url: driverFoto, name: r.driver?.nama ?? "" }) : undefined}
                    isJadwal={true}
                    isToday={isToday(r.departure_date)}
                    originCity={r.origin_city}
                    destinationCity={r.destination_city}
                    departureTime={r.departure_time}
                    departureDate={r.departure_date}
                    kursiTersisa={r.kursi_tersisa}
                    displayPrice={r.segment_price ?? r.price_per_seat}
                    pricePerSeat={r.price_per_seat}
                    rating={rating ?? null}
                    ratingTestId={r.driver ? `driver-rating-${r.driver.id}` : undefined}
                    vehicleLine={vehicleLine}
                    stopovers={stopovers.length > 0 ? stopovers : undefined}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>

      {photoModal && (
        <PhotoLightbox url={photoModal.url} name={photoModal.name} onClose={() => setPhotoModal(null)} />
      )}
    </div>
  );
}
