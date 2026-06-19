import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, ArrowLeftRight, Calendar, Clock, Search, Sparkles, Loader2 } from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { RideCard } from "@/components/ride-card";
import { CitySelect } from "@/components/city-select";
import { useAuth } from "@/contexts/auth";
import { useKota, groupKota } from "@/hooks/useKota";
import { PROVINSI_INDONESIA } from "@/lib/provinsi";
import { resolvePhotoUrl } from "@/lib/photoUrl";

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
  const { kota } = useKota();

  const [provinsiAsal, setProvinsiAsal] = useState<string>("");
  const [provinsiTujuan, setProvinsiTujuan] = useState<string>("");
  const [origin, setOrigin] = useState<string>("");
  const [dest, setDest] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [time, setTime] = useState<string>(nextHourHHMM());

  const [results, setResults] = useState<CarterMitra[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const asalGrouped = useMemo(
    () => (provinsiAsal ? groupKota(kota.filter((k) => k.provinsi === provinsiAsal)) : []),
    [kota, provinsiAsal],
  );
  const tujuanGrouped = useMemo(
    () => (provinsiTujuan ? groupKota(kota.filter((k) => k.provinsi === provinsiTujuan)) : []),
    [kota, provinsiTujuan],
  );

  // Saat provinsi asal dipilih, provinsi tujuan otomatis ikut sama dulu —
  // kecuali penumpang sudah memilih tujuan yang berbeda secara sengaja.
  const handleProvinsiAsalChange = (val: string) => {
    if (provinsiTujuan === "" || provinsiTujuan === provinsiAsal) {
      setProvinsiTujuan(val);
      setDest("");
    }
    setProvinsiAsal(val);
    setOrigin("");
  };

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
        {/* Pilih provinsi */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm font-bold text-accent flex items-center gap-1.5">
            <span aria-hidden>📍</span> Pilih provinsi terlebih dahulu
          </p>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Provinsi Asal</label>
              <select
                data-testid="carter-provinsi-asal"
                value={provinsiAsal}
                onChange={(e) => handleProvinsiAsalChange(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">Pilih provinsi</option>
                {PROVINSI_INDONESIA.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <ArrowRight className="w-4 h-4 text-accent shrink-0 mt-7" />
            <div className="flex-1 min-w-0">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Provinsi Tujuan</label>
              <select
                data-testid="carter-provinsi-tujuan"
                value={provinsiTujuan}
                onChange={(e) => { setProvinsiTujuan(e.target.value); setDest(""); }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">Pilih provinsi</option>
                {PROVINSI_INDONESIA.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Dari</label>
              <CitySelect
                testId="select-origin"
                value={origin}
                disabled={!provinsiAsal}
                onChange={(v) => { setOrigin(v); if (dest === v) setDest(""); }}
                groups={asalGrouped}
                placeholder={provinsiAsal ? "Pilih kota" : "Pilih provinsi dulu"}
              />
            </div>
            <div className="flex justify-center -my-1">
              <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center">
                <ArrowLeftRight className="w-3.5 h-3.5 text-accent" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Ke</label>
              <CitySelect
                testId="select-dest"
                value={dest}
                disabled={!provinsiTujuan}
                onChange={(v) => setDest(v)}
                groups={tujuanGrouped}
                exclude={origin}
                placeholder={provinsiTujuan ? "Pilih kota" : "Pilih provinsi dulu"}
              />
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
                const mFoto = resolvePhotoUrl(m.driver.foto_profil, apiBase);
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
