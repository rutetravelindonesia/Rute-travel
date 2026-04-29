import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, ArrowLeftRight, Calendar, Clock, Users, Wallet, CheckCircle2, MapPin, Car, Plus, Trash2, Navigation } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { KOTA_GROUPED, KOTA_KALTIM } from "@/lib/kota";

interface Kendaraan {
  id: number;
  jenis: string;
  merek: string;
  model: string;
  plat_nomor: string;
  is_default: boolean;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

// Strip semua non-digit dan parse ke number
function parseNum(s: string): number {
  return parseInt(s.replace(/\D/g, ""), 10) || 0;
}

// Format string angka menjadi format ribuan Indonesia (300.000)
function fmtInput(s: string): string {
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return parseInt(digits, 10).toLocaleString("id-ID");
}

function formatTanggal(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const STEPS = ["Rute & Waktu", "Kursi & Harga", "Konfirmasi"];

type FormData = {
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  capacity: string;
  price_per_seat: string;
};

export default function JadwalTetapBuat() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    origin_city: "",
    destination_city: "",
    departure_date: "",
    departure_time: "",
    capacity: "",
    price_per_seat: "",
  });
  const [kendaraanList, setKendaraanList] = useState<Kendaraan[]>([]);
  const [kendaraanId, setKendaraanId] = useState<number | null>(null);
  const [loadingKendaraan, setLoadingKendaraan] = useState(true);
  const [intermediateWaypoints, setIntermediateWaypoints] = useState<{ city: string; price: string }[]>([]);
  const [finalSegmentPrice, setFinalSegmentPrice] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const hasWaypoints = intermediateWaypoints.length > 0;

  const totalWaypointPrice = useMemo(() => {
    if (!hasWaypoints) return null;
    // Full route price = the final cumulative price (Asal → Tujuan akhir)
    const finalPrice = parseInt(finalSegmentPrice.replace(/\D/g, ""), 10) || 0;
    return finalPrice;
  }, [hasWaypoints, finalSegmentPrice]);

  const usedCities = useMemo(() => {
    const used = new Set<string>();
    if (form.origin_city) used.add(form.origin_city);
    if (form.destination_city) used.add(form.destination_city);
    intermediateWaypoints.forEach((w) => { if (w.city) used.add(w.city); });
    return used;
  }, [form.origin_city, form.destination_city, intermediateWaypoints]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/kendaraan/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: Kendaraan[] = await res.json();
          setKendaraanList(data);
          const def = data.find((k) => k.is_default) ?? data[0];
          if (def) setKendaraanId(def.id);
        }
      } finally {
        setLoadingKendaraan(false);
      }
    })();
  }, [token, apiBase]);

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function canNext() {
    if (step === 1) {
      return (
        kendaraanId !== null &&
        form.origin_city &&
        form.destination_city &&
        form.origin_city !== form.destination_city &&
        form.departure_date &&
        form.departure_time
      );
    }
    if (step === 2) {
      const cap = parseInt(form.capacity, 10);
      if (!(cap >= 1 && cap <= 20)) return false;
      if (hasWaypoints) {
        const allWpsFilled = intermediateWaypoints.every((w) => w.city && w.price && parseNum(w.price) >= 0);
        const finalOk = finalSegmentPrice !== "" && parseNum(finalSegmentPrice) >= 0;
        return allWpsFilled && finalOk;
      }
      const price = parseInt(form.price_per_seat.replace(/\D/g, ""), 10);
      return price >= 0 && !isNaN(price);
    }
    return true;
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      if (kendaraanId === null) throw new Error("Pilih kendaraan dulu.");

      let priceNum: number;
      let waypointsToSubmit: { city: string; order_index: number; price_from_prev: number }[] = [];

      if (hasWaypoints) {
        // Harga yang diinput mitra adalah KUMULATIF dari asal ke tiap kota.
        // Konversi ke price_from_prev (selisih antar kota berurutan) untuk disimpan.
        const cumulativePrices = intermediateWaypoints.map((w) => parseInt(w.price.replace(/\D/g, ""), 10) || 0);
        const finalCumulative = parseInt(finalSegmentPrice.replace(/\D/g, ""), 10) || 0;

        const wps = intermediateWaypoints.map((w, i) => {
          const prevCumulative = i > 0 ? cumulativePrices[i - 1] : 0;
          return {
            city: w.city,
            order_index: i + 1,
            price_from_prev: cumulativePrices[i] - prevCumulative,
          };
        });

        const lastCumulative = cumulativePrices.length > 0 ? cumulativePrices[cumulativePrices.length - 1] : 0;
        wps.push({
          city: form.destination_city,
          order_index: wps.length + 1,
          price_from_prev: finalCumulative - lastCumulative,
        });

        waypointsToSubmit = wps;
        priceNum = finalCumulative;
      } else {
        priceNum = parseInt(form.price_per_seat.replace(/\D/g, ""), 10);
      }

      const body = {
        kendaraan_id: kendaraanId,
        origin_city: form.origin_city,
        destination_city: form.destination_city,
        departure_date: form.departure_date,
        departure_time: form.departure_time,
        capacity: parseInt(form.capacity, 10),
        price_per_seat: priceNum,
        waypoints: waypointsToSubmit,
      };
      const res = await fetch(`${apiBase}/schedules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal menyimpan jadwal.");
      }
      toast({ title: "Jadwal berhasil dibuat!", description: `${form.origin_city} → ${form.destination_city}, ${form.departure_date} pukul ${form.departure_time}` });
      setLocation("/dashboard-driver");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-3 bg-card border-b border-border">
        <button
          onClick={() => (step === 1 ? setLocation("/dashboard-driver") : setStep((s) => s - 1))}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Buat Jadwal Tetap</h1>
          <p className="text-xs text-muted-foreground">Langkah {step} dari {STEPS.length}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="px-5 pt-3 pb-2">
        <div className="flex items-center gap-1">
          {STEPS.map((label, i) => {
            const idx = i + 1;
            const active = idx === step;
            const done = idx < step;
            return (
              <div key={idx} className="flex items-center gap-1 flex-1 last:flex-none">
                <div className={`flex items-center gap-1.5 ${active ? "flex-1" : "flex-none"}`}>
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                      done
                        ? "bg-accent text-white"
                        : active
                        ? "bg-accent text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx}
                  </div>
                  {active && (
                    <span className="text-xs font-semibold text-foreground">{label}</span>
                  )}
                </div>
                {idx < STEPS.length && (
                  <div className={`h-px flex-1 mx-1 rounded-full transition-colors ${done ? "bg-accent" : "bg-muted"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Form content */}
      <div className="px-5 pt-3">

        {/* ── STEP 1: Rute & Waktu ── */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Kendaraan selector */}
            <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
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
                    Belum ada kendaraan terdaftar. Tambahkan dulu sebelum membuka jadwal.
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
                  data-testid="select-kendaraan-jadwal"
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

            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-bold text-foreground">Rute Perjalanan</h2>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Kota Asal
                </label>
                <select
                  value={form.origin_city}
                  onChange={(e) => {
                    set("origin_city", e.target.value);
                    if (form.destination_city === e.target.value) set("destination_city", "");
                  }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 appearance-none"
                >
                  <option value="">Pilih kota asal...</option>
                  {KOTA_GROUPED.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.kota.map((k) => <option key={k} value={k}>{k}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4 text-accent" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Kota Tujuan
                </label>
                <select
                  value={form.destination_city}
                  onChange={(e) => set("destination_city", e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 appearance-none"
                >
                  <option value="">Pilih kota tujuan...</option>
                  {KOTA_GROUPED.map((g) => {
                    const filtered = g.kota.filter((k) => k !== form.origin_city);
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

            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-bold text-foreground">Jadwal Keberangkatan</h2>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Tanggal Keberangkatan
                </label>
                <input
                  type="date"
                  min={today}
                  value={form.departure_date}
                  onChange={(e) => set("departure_date", e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Jam Keberangkatan
                </label>
                <div className="relative">
                  <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="time"
                    value={form.departure_time}
                    onChange={(e) => set("departure_time", e.target.value)}
                    className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Kursi & Harga ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-bold text-foreground">Kapasitas Kursi</h2>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Jumlah Kursi Tersedia
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  placeholder="Contoh: 4"
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Maksimal 20 kursi per perjalanan</p>
              </div>

              {/* Visual seat preview — layout mobil */}
              {form.capacity && parseInt(form.capacity) > 0 && parseInt(form.capacity) <= 20 && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground mb-2">Pratinjau kursi:</p>
                  <div className="bg-background/60 rounded-2xl border border-border p-4">
                    {/* Indikator kap depan mobil */}
                    <div className="w-16 h-1 rounded-full bg-muted mx-auto mb-4" />

                    {/* Baris depan: Kursi DEPAN (kiri) + SOPIR (kanan) */}
                    <div className="grid grid-cols-2 gap-6 px-2">
                      {/* DEPAN — kursi penumpang #1 */}
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="w-14 h-14 rounded-xl border-2 border-accent/40 bg-accent/10 flex items-center justify-center">
                          <span className="text-base font-bold text-accent">1</span>
                        </div>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Depan</span>
                      </div>

                      {/* SOPIR — di sebelah kanan */}
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="w-14 h-14 rounded-xl bg-foreground flex items-center justify-center">
                          <Users className="w-5 h-5 text-background" />
                        </div>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sopir</span>
                      </div>
                    </div>

                    {/* Divider antara baris depan dan belakang */}
                    {parseInt(form.capacity) > 1 && (
                      <>
                        <div className="my-4 h-px bg-border" />

                        {/* BAGASI — kursi belakang dalam grid 3 kolom */}
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {Array.from({ length: parseInt(form.capacity) - 1 }).map((_, i) => (
                            <div
                              key={i}
                              className="aspect-square rounded-xl border-2 border-accent/40 bg-accent/10 flex items-center justify-center"
                            >
                              <span className="text-sm font-bold text-accent">{i + 2}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Bagasi</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-bold text-foreground">Harga per Kursi</h2>
              </div>

              {!hasWaypoints && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Tarif penuh ({form.origin_city || "asal"} → {form.destination_city || "tujuan"})
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="150.000"
                      value={form.price_per_seat}
                      onChange={(e) => set("price_per_seat", fmtInput(e.target.value))}
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  {form.price_per_seat && parseNum(form.price_per_seat) > 0 && (
                    <p className="text-xs font-semibold mt-1.5" style={{ color: "hsl(var(--accent))" }}>
                      {formatRupiah(parseNum(form.price_per_seat))} per kursi
                    </p>
                  )}
                </div>
              )}

              {hasWaypoints && totalWaypointPrice !== null && totalWaypointPrice > 0 && (
                <div className="bg-accent/5 rounded-xl p-3 border border-accent/20">
                  <p className="text-xs text-muted-foreground">Harga rute penuh ({form.origin_city || "Asal"} → {form.destination_city || "Tujuan"}):</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{formatRupiah(totalWaypointPrice)} per kursi</p>
                  <p className="text-[10px] text-muted-foreground">Isi harga tiap tujuan di bagian Kota Singgah di bawah</p>
                </div>
              )}

            </div>

            {/* Kota Singgah */}
            {form.origin_city && form.destination_city && (
              <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-bold text-foreground">Kota Singgah</h2>
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Opsional</span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Kota yang disinggahi untuk menurunkan penumpang. Penumpang hanya naik dari {form.origin_city || "kota asal"} — isi harga tiap tujuan dari {form.origin_city || "asal"}.
                </p>

                {/* Rute visual */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
                    <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    <span className="text-sm font-semibold text-foreground">{form.origin_city}</span>
                    <span className="text-xs text-muted-foreground ml-auto">(Asal)</span>
                  </div>

                  {intermediateWaypoints.map((wp, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center gap-1.5 ml-2">
                        <div className="w-px h-4 bg-border ml-[3px]" />
                      </div>
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1.5">
                          <select
                            value={wp.city}
                            onChange={(e) => {
                              const updated = [...intermediateWaypoints];
                              updated[idx] = { ...updated[idx], city: e.target.value };
                              setIntermediateWaypoints(updated);
                            }}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                          >
                            <option value="">Pilih kota singgah...</option>
                            {KOTA_GROUPED.map((g) => {
                              const filtered = g.kota.filter((k) => !usedCities.has(k) || k === wp.city);
                              if (filtered.length === 0) return null;
                              return (
                                <optgroup key={g.label} label={g.label}>
                                  {filtered.map((k) => <option key={k} value={k}>{k}</option>)}
                                </optgroup>
                              );
                            })}
                          </select>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Rp</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="300.000"
                              value={wp.price}
                              onChange={(e) => {
                                const updated = [...intermediateWaypoints];
                                updated[idx] = { ...updated[idx], price: fmtInput(e.target.value) };
                                setIntermediateWaypoints(updated);
                              }}
                              className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                            />
                          </div>
                          {wp.city && wp.price && parseNum(wp.price) > 0 ? (
                            <p className="text-[11px] text-accent font-medium px-1">
                              {form.origin_city} → {wp.city}: {formatRupiah(parseNum(wp.price))}
                            </p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground px-1">
                              Tarif dari {form.origin_city || "asal"} ke {wp.city || "kota ini"}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setIntermediateWaypoints((wps) => wps.filter((_, i) => i !== idx))}
                          className="mt-1.5 p-2 rounded-xl bg-red-50 text-red-400 hover:bg-red-100 flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Final segment to destination */}
                  {hasWaypoints && (
                    <>
                      <div className="flex items-center gap-1.5 ml-2">
                        <div className="w-px h-4 bg-border ml-[3px]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border mb-1.5">
                          <div className="w-2 h-2 rounded-full border-2 border-accent flex-shrink-0" />
                          <span className="text-sm font-semibold text-foreground">{form.destination_city}</span>
                          <span className="text-xs text-muted-foreground ml-auto">(Tujuan)</span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Rp</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="700.000"
                            value={finalSegmentPrice}
                            onChange={(e) => setFinalSegmentPrice(fmtInput(e.target.value))}
                            className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                          />
                        </div>
                        {finalSegmentPrice && parseNum(finalSegmentPrice) > 0 ? (
                          <p className="text-[11px] text-accent font-medium px-1 mt-1">
                            {form.origin_city} → {form.destination_city}: {formatRupiah(parseNum(finalSegmentPrice))}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground px-1 mt-1">
                            Tarif penuh dari {form.origin_city || "asal"} ke {form.destination_city}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {!hasWaypoints && (
                    <div className="flex items-center gap-1.5 ml-2">
                      <div className="w-px h-4 bg-border ml-[3px]" />
                    </div>
                  )}
                  {!hasWaypoints && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 border border-dashed border-border">
                      <div className="w-2 h-2 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{form.destination_city}</span>
                      <span className="text-xs text-muted-foreground ml-auto">(Tujuan)</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setIntermediateWaypoints((wps) => [...wps, { city: "", price: "" }])}
                  className="w-full py-2.5 rounded-xl border border-dashed border-accent/40 text-accent text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-accent/5"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Kota Singgah
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Konfirmasi ── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Periksa kembali detail jadwal sebelum disimpan.</p>

            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {/* Rute header */}
              <div className="bg-accent/10 px-5 py-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground">Asal</p>
                    <p className="text-base font-bold text-foreground mt-0.5">{form.origin_city}</p>
                  </div>
                  <div className="px-4">
                    <ArrowLeftRight className="w-5 h-5 text-accent" />
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground">Tujuan</p>
                    <p className="text-base font-bold text-foreground mt-0.5">{form.destination_city}</p>
                  </div>
                </div>
              </div>

              {/* Detail rows */}
              <div className="divide-y divide-border">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Tanggal</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{formatTanggal(form.departure_date)}</p>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">Jam Berangkat</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{form.departure_time} WIT</p>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span className="text-xs">Kapasitas</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{form.capacity} kursi</p>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Wallet className="w-4 h-4" />
                    <span className="text-xs">Harga per Kursi</span>
                  </div>
                  <p className="text-sm font-bold text-foreground" style={{ color: "hsl(var(--accent))" }}>
                    {hasWaypoints && totalWaypointPrice ? formatRupiah(totalWaypointPrice) : formatRupiah(parseNum(form.price_per_seat))}
                  </p>
                </div>

                {hasWaypoints && (
                  <div className="px-5 py-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Navigation className="w-4 h-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Kota Singgah</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-foreground">
                      <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 inline-block" />
                      {form.origin_city}
                    </div>
                    {intermediateWaypoints.map((wp, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-foreground">
                          <span className="w-2 h-2 rounded-full border border-accent flex-shrink-0 inline-block" />
                          {wp.city}
                        </div>
                        <span className="text-accent font-semibold">{formatRupiah(parseNum(wp.price || "0"))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-foreground">
                        <span className="w-2 h-2 rounded-full border-2 border-accent flex-shrink-0 inline-block" />
                        {form.destination_city}
                      </div>
                      <span className="text-accent font-semibold">{formatRupiah(parseNum(finalSegmentPrice || "0"))}</span>
                    </div>
                  </div>
                )}
              </div>

            </div>

            <p className="text-xs text-muted-foreground text-center px-4">
              Setelah disimpan, jadwal akan langsung aktif dan bisa dipesan oleh penumpang.
            </p>
          </div>
        )}
      </div>

      {/* Bottom CTA — natural flow, langsung setelah form */}
      <div className="px-5 pt-6">
        {step < 3 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg ${
              canNext()
                ? "bg-accent text-white hover:bg-accent/90 active:bg-accent/80"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            Lanjut
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 transition-colors bg-accent hover:bg-accent/90 active:bg-accent/80 shadow-lg disabled:opacity-60"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {loading ? "Menyimpan..." : "Simpan Jadwal"}
          </button>
        )}
      </div>
    </div>
  );
}
