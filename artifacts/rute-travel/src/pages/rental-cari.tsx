import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, Car, Loader2, KeyRound, UserRound, MapPin, ChevronRight } from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { CitySelect } from "@/components/city-select";
import { useAuth } from "@/contexts/auth";
import { useKota, groupKota } from "@/hooks/useKota";
import { PROVINSI_INDONESIA } from "@/lib/provinsi";
import { resolvePhotoUrl } from "@/lib/photoUrl";

type RentalMode = "lepas_kunci" | "dengan_sopir" | "dua-duanya";

interface RentalResult {
  id: number;
  kota: string;
  mode: RentalMode;
  harga_lepas_kunci: number | null;
  harga_dengan_sopir: number | null;
  deposit: number | null;
  catatan: string | null;
  driver: { id: number; nama: string; foto_profil: string | null };
  kendaraan: {
    id: number;
    jenis: string;
    merek: string;
    model: string;
    warna: string;
    plat_nomor: string;
    foto_url: string | null;
    tahun: number | null;
  };
}

const MODE_FILTERS: { value: "" | "lepas_kunci" | "dengan_sopir"; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "lepas_kunci", label: "Lepas Kunci" },
  { value: "dengan_sopir", label: "Dengan Sopir" },
];

function fmtRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function offersLepas(mode: RentalMode) {
  return mode === "lepas_kunci" || mode === "dua-duanya";
}
function offersSopir(mode: RentalMode) {
  return mode === "dengan_sopir" || mode === "dua-duanya";
}

export default function RentalCari() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const { kota } = useKota();

  const [provinsi, setProvinsi] = useState<string>("");
  const [kotaSel, setKotaSel] = useState<string>("");
  const [modeFilter, setModeFilter] = useState<"" | "lepas_kunci" | "dengan_sopir">("");

  const [results, setResults] = useState<RentalResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const kotaGrouped = useMemo(
    () => (provinsi ? groupKota(kota.filter((k) => k.provinsi === provinsi)) : []),
    [kota, provinsi],
  );

  const canSearch = !!kotaSel && !searching;

  async function handleSearch() {
    if (!canSearch || !token) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const params = new URLSearchParams({ kota: kotaSel });
      if (modeFilter) params.set("mode", modeFilter);
      const res = await fetch(`${apiBase}/rental/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal mencari rental.");
      }
      const data: RentalResult[] = await res.json();
      setResults(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
      setSearchError(msg);
    } finally {
      setSearching(false);
    }
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
            <Car className="w-4 h-4 text-blue-600" />
            Rental Kendaraan
          </h1>
          <p className="text-xs text-muted-foreground">Sewa mobil lepas kunci atau dengan sopir</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Pilih kota */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm font-bold text-accent flex items-center gap-1.5">
            <span aria-hidden>📍</span> Pilih lokasi rental
          </p>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Provinsi</label>
            <select
              data-testid="rental-provinsi"
              value={provinsi}
              onChange={(e) => { setProvinsi(e.target.value); setKotaSel(""); }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">Pilih provinsi</option>
              {PROVINSI_INDONESIA.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Kota</label>
            <CitySelect
              testId="rental-kota"
              value={kotaSel}
              disabled={!provinsi}
              onChange={(v) => setKotaSel(v)}
              groups={kotaGrouped}
              placeholder={provinsi ? "Pilih kota" : "Pilih provinsi dulu"}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Mode (opsional)</label>
            <div className="grid grid-cols-3 gap-2">
              {MODE_FILTERS.map((m) => (
                <button
                  key={m.value || "all"}
                  onClick={() => setModeFilter(m.value)}
                  data-testid={`filter-mode-${m.value || "all"}`}
                  className={`py-2.5 px-2 rounded-xl border-2 text-xs font-semibold transition-colors ${
                    modeFilter === m.value
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-background text-foreground hover:border-accent/40"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!canSearch}
            data-testid="search-btn"
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searching ? "Mencari..." : "Cari Rental"}
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
                ? "Belum ada kendaraan tersedia untuk lokasi ini."
                : `${results.length} kendaraan tersedia`}
            </p>
            <div className="space-y-3">
              {results.map((r) => {
                const foto = resolvePhotoUrl(r.kendaraan.foto_url, apiBase);
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`rental-offer-${r.id}`}
                    onClick={() => setLocation(`/rental/${r.id}/book`)}
                    onKeyDown={(e) => e.key === "Enter" && setLocation(`/rental/${r.id}/book`)}
                    className="w-full text-left bg-card rounded-2xl border border-border overflow-hidden hover:border-accent/60 transition-colors cursor-pointer"
                  >
                    <div className="w-full h-36 bg-muted overflow-hidden flex items-center justify-center">
                      {foto ? (
                        <img
                          src={foto}
                          alt={`${r.kendaraan.merek} ${r.kendaraan.model}`}
                          className="w-full h-full object-cover"
                          onClick={(e) => { e.stopPropagation(); setPhotoModal({ url: foto, name: `${r.kendaraan.merek} ${r.kendaraan.model}` }); }}
                        />
                      ) : (
                        <Car className="w-10 h-10 text-muted-foreground" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">
                            {r.kendaraan.merek} {r.kendaraan.model}
                            {r.kendaraan.tahun ? ` · ${r.kendaraan.tahun}` : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {r.kota}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {offersLepas(r.mode) && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                            <KeyRound className="w-2.5 h-2.5" /> Lepas Kunci
                          </span>
                        )}
                        {offersSopir(r.mode) && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center gap-1">
                            <UserRound className="w-2.5 h-2.5" /> Dengan Sopir
                          </span>
                        )}
                      </div>

                      <div className="mt-2 space-y-0.5">
                        {offersLepas(r.mode) && r.harga_lepas_kunci != null && (
                          <p className="text-sm font-bold text-accent">
                            {fmtRupiah(r.harga_lepas_kunci)}
                            <span className="text-[10px] text-muted-foreground font-normal"> /hari (lepas kunci)</span>
                          </p>
                        )}
                        {offersSopir(r.mode) && r.harga_dengan_sopir != null && (
                          <p className="text-sm font-bold text-accent">
                            {fmtRupiah(r.harga_dengan_sopir)}
                            <span className="text-[10px] text-muted-foreground font-normal"> /hari (dengan sopir)</span>
                          </p>
                        )}
                        {r.deposit != null && r.deposit > 0 && (
                          <p className="text-[11px] text-muted-foreground">Deposit: {fmtRupiah(r.deposit)}</p>
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-2">
                        Mitra: <span className="font-medium text-foreground">{r.driver.nama}</span>
                      </p>
                    </div>
                  </div>
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
