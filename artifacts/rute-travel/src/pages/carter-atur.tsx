import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Calendar, Clock, MapPin, Wallet, CheckCircle2, Save, Car } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { KOTA_GROUPED } from "@/lib/kota";

interface Kendaraan {
  id: number;
  jenis: string;
  merek: string;
  model: string;
  plat_nomor: string;
  is_default: boolean;
}

const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function fmtDateISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtRupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export default function CarterAtur() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();

  const [originCity, setOriginCity] = useState<string>("");
  const [is24Hours, setIs24Hours] = useState<boolean>(true);
  const [hoursStart, setHoursStart] = useState<string>("06:00");
  const [hoursEnd, setHoursEnd] = useState<string>("22:00");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [kendaraanList, setKendaraanList] = useState<Kendaraan[]>([]);
  const [kendaraanId, setKendaraanId] = useState<number | null>(null);
  const [loadingKendaraan, setLoadingKendaraan] = useState(true);

  const next14Days = useMemo(() => {
    const arr: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  // Gabungan: 14 hari ke depan + tanggal lama yang masih aktif (sudah lewat tapi belum dinonaktifkan)
  const displayDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = fmtDateISO(today);
    const next14Isos = new Set(next14Days.map((d) => fmtDateISO(d)));
    // Tanggal aktif yang lebih lama dari hari ini dan tidak ada di grid
    const pastSelected = selectedDates
      .filter((iso) => iso < todayIso && !next14Isos.has(iso))
      .map((iso) => new Date(iso + "T00:00:00"));
    const merged = [...pastSelected, ...next14Days];
    merged.sort((a, b) => a.getTime() - b.getTime());
    return merged;
  }, [next14Days, selectedDates]);

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  useEffect(() => {
    if (!token) {
      setLoadingExisting(false);
      setLoadingKendaraan(false);
      return;
    }
    (async () => {
      try {
        const [resCarter, resKend] = await Promise.all([
          fetch(`${apiBase}/carter/settings/mine`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiBase}/kendaraan/mine`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        let kendList: Kendaraan[] = [];
        if (resKend.ok) {
          kendList = await resKend.json();
          setKendaraanList(kendList);
        }

        if (resCarter.ok) {
          const data = await resCarter.json();
          if (data) {
            setOriginCity(data.origin_city);
            setIs24Hours(data.is_24_hours);
            if (!data.is_24_hours) {
              setHoursStart(data.hours_start ?? "06:00");
              setHoursEnd(data.hours_end ?? "22:00");
            }
            setSelectedDates(data.dates ?? []);
            setBookedDates(data.booked_dates ?? []);
            const r: Record<string, string> = {};
            (data.routes ?? []).forEach((rt: { destination_city: string; price: number }) => {
              r[rt.destination_city] = String(rt.price);
            });
            setRoutes(r);
            if (data.kendaraan_id && kendList.some((k) => k.id === data.kendaraan_id)) {
              setKendaraanId(data.kendaraan_id);
            }
          }
        }

        setKendaraanId((curr) => {
          if (curr !== null && kendList.some((k) => k.id === curr)) return curr;
          const def = kendList.find((k) => k.is_default) ?? kendList[0];
          return def ? def.id : null;
        });
      } finally {
        setLoadingExisting(false);
        setLoadingKendaraan(false);
      }
    })();
  }, [token, apiBase]);

  function toggleDate(iso: string) {
    if (bookedDates.includes(iso)) return;
    setSelectedDates((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso]));
  }

  function toggleRoute(city: string) {
    setRoutes((prev) => {
      const next = { ...prev };
      if (city in next) {
        delete next[city];
      } else {
        next[city] = "";
      }
      return next;
    });
  }

  function setRoutePrice(city: string, value: string) {
    const onlyDigits = value.replace(/\D/g, "");
    setRoutes((prev) => ({ ...prev, [city]: onlyDigits }));
  }

  const tujuanList = useMemo(
    () => KOTA_GROUPED.flatMap((g) => g.kota).filter((k) => k !== originCity),
    [originCity]
  );

  const isValid = useMemo(() => {
    if (kendaraanId === null) return false;
    if (!originCity) return false;
    if (selectedDates.length === 0) return false;
    if (!is24Hours && (!hoursStart || !hoursEnd)) return false;
    const routeKeys = Object.keys(routes);
    if (routeKeys.length === 0) return false;
    for (const k of routeKeys) {
      const v = parseInt(routes[k], 10);
      if (isNaN(v) || v <= 0) return false;
    }
    return true;
  }, [kendaraanId, originCity, selectedDates, is24Hours, hoursStart, hoursEnd, routes]);

  async function handleSave() {
    if (!isValid || !token) return;
    setLoading(true);
    try {
      if (kendaraanId === null) throw new Error("Pilih kendaraan dulu.");
      const body = {
        kendaraan_id: kendaraanId,
        origin_city: originCity,
        is_24_hours: is24Hours,
        hours_start: is24Hours ? null : hoursStart,
        hours_end: is24Hours ? null : hoursEnd,
        dates: selectedDates,
        routes: Object.entries(routes).map(([destination_city, price]) => ({
          destination_city,
          price: parseInt(price, 10),
        })),
      };
      const res = await fetch(`${apiBase}/carter/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal menyimpan");
      }
      const result = await res.json();
      const protectedDates: string[] = result.protected_dates ?? [];
      if (protectedDates.length > 0) {
        // Update state: tanggal yang dilindungi tetap ada di selectedDates & bookedDates
        setSelectedDates((prev) => [...new Set([...prev, ...protectedDates])]);
        setBookedDates(protectedDates);
        toast({
          title: "Sebagian disimpan",
          description: `${protectedDates.length} tanggal tidak bisa dihapus karena sudah ada pesanan aktif (${protectedDates.join(", ")}).`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Berhasil", description: "Pengaturan Carter telah disimpan." });
        setLocation("/dashboard-driver");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menyimpan";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (loadingExisting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-3 bg-card border-b border-border">
        <button
          onClick={() => setLocation("/dashboard-driver")}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Atur Carter</h1>
          <p className="text-xs text-muted-foreground">Tentukan ketersediaan & harga Carter Anda</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-5">
        {/* SECTION 0: Kendaraan */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Kendaraan</h2>
          </div>
          {loadingKendaraan ? (
            <div className="flex justify-center py-3">
              <div className="w-5 h-5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
            </div>
          ) : kendaraanList.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Belum ada kendaraan terdaftar. Tambahkan dulu sebelum mengaktifkan Carter.
              </p>
              <button
                type="button"
                onClick={() => setLocation("/profil/kendaraan/baru")}
                className="w-full py-2.5 rounded-xl bg-accent text-white text-xs font-bold"
              >
                Tambah Kendaraan
              </button>
            </div>
          ) : kendaraanList.length === 1 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Otomatis dipakai</p>
              <p className="text-sm font-bold text-foreground">
                {kendaraanList[0].merek} {kendaraanList[0].model} · {kendaraanList[0].plat_nomor}
              </p>
            </div>
          ) : (
            <select
              value={kendaraanId ?? ""}
              onChange={(e) => setKendaraanId(parseInt(e.target.value, 10))}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 appearance-none"
              data-testid="select-kendaraan-carter"
            >
              {kendaraanList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.merek} {k.model} · {k.plat_nomor}
                  {k.is_default ? " (utama)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* SECTION 1: Tanggal Available */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Tanggal Available</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Tap tanggal untuk menandai kapan Anda siap menerima Carter. Tanggal lama yang masih aktif ditampilkan dengan warna merah — tap untuk menonaktifkan.
          </p>

          {bookedDates.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <span className="text-amber-600 text-base leading-none mt-0.5">⚠️</span>
              <p className="text-xs text-amber-800">
                Tanggal bertanda pesanan tidak bisa dibatalkan karena sudah ada pesanan aktif.
                Hubungi penumpang terlebih dahulu jika perlu membatalkan.
              </p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            {displayDates.map((d) => {
              const iso = fmtDateISO(d);
              const active = selectedDates.includes(iso);
              const isBooked = bookedDates.includes(iso);
              const todayIso = fmtDateISO(new Date());
              const isPast = iso < todayIso;
              return (
                <button
                  key={iso}
                  onClick={() => toggleDate(iso)}
                  disabled={isBooked}
                  className={`py-2.5 rounded-xl border-2 transition-colors text-center relative ${
                    isBooked
                      ? "border-amber-400 bg-amber-50 text-amber-900 cursor-not-allowed"
                      : active && isPast
                      ? "border-red-300 bg-red-50 text-red-800"
                      : active
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-background text-foreground hover:border-accent/40"
                  }`}
                >
                  <div className={`text-[10px] font-semibold uppercase ${isBooked ? "text-amber-700" : active && isPast ? "text-red-500" : active ? "text-white/80" : "text-muted-foreground"}`}>
                    {HARI_PENDEK[d.getDay()]}
                  </div>
                  <div className="text-base font-bold">{d.getDate()}</div>
                  <div className={`text-[10px] ${isBooked ? "text-amber-600" : active && isPast ? "text-red-400" : active ? "text-white/80" : "text-muted-foreground"}`}>
                    {BULAN_PENDEK[d.getMonth()]}
                  </div>
                  {isBooked && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold leading-none">!</span>
                    </div>
                  )}
                  {isPast && active && !isBooked && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-400 flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold leading-none">✕</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedDates.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <p className="text-accent font-semibold">{selectedDates.length} tanggal dipilih</p>
              {bookedDates.length > 0 && (
                <p className="text-amber-600 font-semibold">{bookedDates.length} terkunci (ada pesanan)</p>
              )}
            </div>
          )}

          {/* Legenda */}
          {bookedDates.length > 0 && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border-2 border-accent bg-accent inline-block" /> Aktif
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border-2 border-amber-400 bg-amber-50 inline-block" /> Ada pesanan (terkunci)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border-2 border-border bg-background inline-block" /> Kosong
              </span>
            </div>
          )}
        </div>

        {/* SECTION 2: Jam Operasional */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Jam Operasional</h2>
          </div>
          <p className="text-xs text-muted-foreground">Pilih kapan Anda bisa dihubungi penumpang.</p>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setIs24Hours(true)}
              className={`py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                is24Hours
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-background text-foreground hover:border-accent/40"
              }`}
            >
              24 Jam
            </button>
            <button
              onClick={() => setIs24Hours(false)}
              className={`py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                !is24Hours
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-background text-foreground hover:border-accent/40"
              }`}
            >
              Jam Tertentu
            </button>
          </div>

          {!is24Hours && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Jam Mulai
                </label>
                <input
                  type="time"
                  value={hoursStart}
                  onChange={(e) => setHoursStart(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Jam Akhir
                </label>
                <input
                  type="time"
                  value={hoursEnd}
                  onChange={(e) => setHoursEnd(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: Rute Layanan */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Rute Layanan</h2>
          </div>

          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Kota Asal
            </label>
            <select
              value={originCity}
              onChange={(e) => {
                setOriginCity(e.target.value);
                setRoutes((prev) => {
                  const next = { ...prev };
                  if (e.target.value in next) delete next[e.target.value];
                  return next;
                });
              }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 appearance-none"
            >
              <option value="">Pilih kota asal...</option>
              {KOTA_GROUPED.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.kota.map((k) => <option key={k} value={k}>{k}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {originCity && (
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Kota Tujuan (pilih satu atau lebih)
              </label>
              <div className="flex flex-wrap gap-2">
                {tujuanList.map((k) => {
                  const active = k in routes;
                  return (
                    <button
                      key={k}
                      onClick={() => toggleRoute(k)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
                        active
                          ? "border-accent bg-accent text-white"
                          : "border-border bg-background text-foreground hover:border-accent/40"
                      }`}
                    >
                      {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 4: Harga per Rute */}
        {Object.keys(routes).length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-foreground">Harga per Rute</h2>
            </div>
            <p className="text-xs text-muted-foreground">Tentukan tarif Carter untuk setiap rute.</p>

            <div className="space-y-3">
              {Object.entries(routes).map(([dest, price]) => (
                <div key={dest} className="border border-border rounded-xl p-3 bg-background/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-foreground">{originCity}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-xs font-semibold text-foreground">{dest}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">
                      Rp
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={price ? fmtRupiah(parseInt(price, 10) || 0) : ""}
                      onChange={(e) => setRoutePrice(dest, e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOMBOL SIMPAN */}
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={!isValid || loading}
            className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg ${
              isValid && !loading
                ? "bg-accent text-white hover:bg-accent/90 active:bg-accent/80"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {loading ? "Menyimpan..." : "Simpan Pengaturan"}
          </button>
        </div>
      </div>
    </div>
  );
}
