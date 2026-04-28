import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Calendar, Clock, MapPin, Search, Sparkles, Loader2 } from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { RideCard } from "@/components/ride-card";
import { useAuth } from "@/contexts/auth";
import { KOTA_GROUPED } from "@/lib/kota";

interface CarterMitra {
  settings_id: number;
  origin_city: string;
  destination_city: string;
  price: number;
  is_24_hours: boolean;
  hours_start: string | null;
  hours_end: string | null;
  driver: { id: number; nama: string; foto_profil: string | null };
  kendaraan: {
    id: number;
    jenis: string;
    merek: string;
    model: string;
    warna: string;
    plat_nomor: string;
    foto_url: string | null;
  };
}


function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextHourHHMM() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}


export default function CarterCari() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [origin, setOrigin] = useState<string>("Samarinda");
  const [dest, setDest] = useState<string>("Balikpapan");
  const [date, setDate] = useState<string>(todayISO());
  const [time, setTime] = useState<string>(nextHourHHMM());

  const [results, setResults] = useState<CarterMitra[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const tujuanList = useMemo(
    () => KOTA_GROUPED.flatMap((g) => g.kota).filter((k) => k !== origin),
    [origin]
  );

  useEffect(() => {
    if (dest === origin) {
      const next = tujuanList[0];
      if (next) setDest(next);
    }
  }, [origin, dest, tujuanList]);

  const canSearch = !!origin && !!dest && origin !== dest && !!date && !!time && !searching;

  async function handleSearch() {
    if (!canSearch || !token) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const params = new URLSearchParams({
        origin_city: origin,
        destination_city: dest,
        date,
        time,
      });
      const res = await fetch(`${apiBase}/carter/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal mencari Carter.");
      }
      const data: CarterMitra[] = await res.json();
      setResults(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
      setSearchError(msg);
    } finally {
      setSearching(false);
    }
  }

  function pickMitra(m: CarterMitra) {
    const params = new URLSearchParams({ date, time, dest });
    setLocation(`/carter/${m.settings_id}/book?${params.toString()}`);
  }

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
          <h1 className="text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Cari Carter
          </h1>
          <p className="text-xs text-muted-foreground">Sewa penuh — kamu yang pilih jam</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Form */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Dari
              </label>
              <select
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                data-testid="select-origin"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 appearance-none"
              >
                {KOTA_GROUPED.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.kota.map((k) => <option key={k} value={k}>{k}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Ke
              </label>
              <select
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                data-testid="select-dest"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 appearance-none"
              >
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Tanggal
              </label>
              <input
                type="date"
                value={date}
                min={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-date"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Jam Berangkat
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                data-testid="input-time"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!canSearch}
            data-testid="search-btn"
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searching ? "Mencari..." : "Cari Mitra Carter"}
          </button>
        </div>

        {/* Hasil */}
        {searchError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3" data-testid="search-error">
            {searchError}
          </div>
        )}

        {results !== null && (
          <div>
            <p className="text-xs text-muted-foreground mb-2" data-testid="results-count">
              {results.length === 0
                ? "Belum ada mitra yang available untuk tanggal & jam ini."
                : `${results.length} mitra tersedia`}
            </p>
            <div className="space-y-3">
              {results.map((m) => {
                const mFoto = m.driver.foto_profil ? `${apiBase}/storage${m.driver.foto_profil}` : null;
                const driverInitials = m.driver.nama.split(" ").map((s: string) => s[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("");
                return (
                  <RideCard
                    key={m.settings_id}
                    variant="carter"
                    testId={`carter-mitra-${m.settings_id}`}
                    onClick={() => pickMitra(m)}
                    driverFoto={mFoto}
                    driverInitials={driverInitials}
                    driverName={m.driver.nama}
                    onAvatarClick={mFoto ? () => setPhotoModal({ url: mFoto, name: m.driver.nama }) : undefined}
                    originCity={m.origin_city}
                    destinationCity={m.destination_city}
                    is24Hours={m.is_24_hours}
                    hoursStart={m.hours_start}
                    hoursEnd={m.hours_end}
                    settingsId={m.settings_id}
                    totalPrice={m.price}
                    vehicleLine={`${m.kendaraan.merek} ${m.kendaraan.model} · ${m.kendaraan.plat_nomor}`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {photoModal && (
        <PhotoLightbox url={photoModal.url} name={photoModal.name} onClose={() => setPhotoModal(null)} />
      )}
    </div>
  );
}
