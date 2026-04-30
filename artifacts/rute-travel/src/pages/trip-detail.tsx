import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock4,
  Car,
  Users,
  MessageCircle,
  Phone,
  Map as MapIcon,
  CheckCircle2,
  Loader2,
  Navigation2,
  Circle,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";

type TripProgress = "belum_jemput" | "sudah_jemput" | "dalam_perjalanan" | "selesai";

interface Passenger {
  booking_id: number;
  kursi: string[];
  status: string;
  total_amount: number;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_label: string | null;
  catatan: string | null;
  penumpang: { id: number; nama: string; no_whatsapp: string | null; foto_profil: string | null } | null;
}

interface TripDetailData {
  id: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  capacity: number;
  trip_progress: TripProgress;
  kendaraan: {
    jenis: string;
    merek: string;
    model: string;
    warna: string;
    plat_nomor: string;
  } | null;
  passengers: Passenger[];
  total_pendapatan: number;
}

function formatDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatRupiah(n: number) {
  return "Rp" + n.toLocaleString("id-ID");
}

const STAGES: { key: TripProgress; label: string }[] = [
  { key: "sudah_jemput", label: "Menuju lokasi jemput penumpang" },
  { key: "dalam_perjalanan", label: "Dalam perjalanan ke kota tujuan" },
  { key: "selesai", label: "Selesai" },
];

function stageIndex(p: TripProgress) {
  if (p === "belum_jemput") return -1;
  if (p === "semua_naik") return 0;
  return STAGES.findIndex((s) => s.key === p);
}

function buttonLabel(p: TripProgress): string | null {
  if (p === "belum_jemput") return "Mulai Jemput Konsumen";
  if (p === "sudah_jemput") return "Penumpang Sudah Naik Semua";
  if (p === "semua_naik") return "Berangkat ke Kota Tujuan";
  if (p === "dalam_perjalanan") return "Selesaikan Trip";
  return null;
}

function statusBadge(s: string) {
  if (s === "paid") return { cls: "bg-green-100 text-green-800", label: "Lunas" };
  if (s === "pending") return { cls: "bg-yellow-100 text-yellow-800", label: "Menunggu Bayar" };
  return { cls: "bg-muted text-muted-foreground", label: s };
}

function initials(nama: string) {
  return nama.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function TripDetailPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/trip/:scheduleId/detail");
  const { token } = useAuth();
  const scheduleId = params?.scheduleId ? Number(params.scheduleId) : null;

  const [data, setData] = useState<TripDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTrip, setBusyTrip] = useState(false);
  const [busyChat, setBusyChat] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  async function load() {
    if (!token || !scheduleId) return;
    try {
      const res = await fetch(`${apiBase}/schedules/${scheduleId}/trip-detail`, {
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
  }, [token, scheduleId]);

  async function openChat(bookingId: number) {
    if (!token) return;
    setBusyChat(bookingId);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/chat/threads`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ booking_type: "schedule", booking_id: bookingId }),
      });
      const j = await res.json();
      if (!res.ok || !j?.id) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setLocation(`/chat/${j.id}`);
    } catch (e: any) {
      setActionError(`Gagal membuka chat: ${e.message ?? e}`);
    } finally {
      setBusyChat(null);
    }
  }

  function openPhone(noWa: string | null) {
    if (!noWa) { setActionError("Nomor tidak tersedia."); return; }
    window.location.href = `tel:${noWa}`;
  }

  function openMap(p: Passenger) {
    if (p.pickup_lat == null || p.pickup_lng == null) {
      setActionError("Titik jemput belum diisi penumpang.");
      return;
    }
    window.open(`https://www.google.com/maps?q=${p.pickup_lat},${p.pickup_lng}`, "_blank", "noopener,noreferrer");
  }

  async function advanceProgress() {
    if (!token || !scheduleId || !data) return;
    setBusyTrip(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/schedules/${scheduleId}/trip-progress`, {
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

  const stageCls = (tp: TripProgress) => {
    if (tp === "sudah_jemput") return "bg-blue-100 text-blue-800";
    if (tp === "dalam_perjalanan") return "bg-indigo-100 text-indigo-800";
    if (tp === "selesai") return "bg-green-100 text-green-800";
    return "bg-amber-100 text-amber-800";
  };

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

  const curStageIdx = stageIndex(data.trip_progress);
  const btn = buttonLabel(data.trip_progress);

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="bg-[#a85e28] text-white px-4 pt-12 pb-6">
        <button onClick={() => setLocation("/pesanan")} className="flex items-center gap-1 text-white/80 mb-3 text-sm">
          <ArrowLeft className="w-4 h-4" /> Pesanan
        </button>
        <p className="text-xs uppercase tracking-widest text-white/70 mb-1">Jadwal Tetap</p>
        <h1 className="text-xl font-bold leading-tight">{data.origin_city} → {data.destination_city}</h1>
        <div className="flex items-center gap-3 mt-2 text-white/80 text-sm">
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(data.departure_date)}</span>
          <span className="flex items-center gap-1"><Clock4 className="w-3.5 h-3.5" />{data.departure_time}</span>
        </div>
        <div className="mt-3">
          <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${stageCls(data.trip_progress)}`}>
            {curStageIdx >= 0 ? STAGES[curStageIdx]?.label : "Menuju lokasi jemput penumpang"}
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
              Daftar Penumpang
            </p>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              {data.passengers.length} penumpang · {data.passengers.reduce((s, p) => s + p.kursi.length, 0)} kursi
            </span>
          </div>

          {data.passengers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada penumpang aktif.</p>
          ) : (
            <div className="space-y-3">
              {data.passengers.map((p, idx) => {
                const sb = statusBadge(p.status);
                const nama = p.penumpang?.nama ?? "—";
                return (
                  <div key={p.booking_id} className="border border-border/50 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-amber-800">
                          {initials(nama)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-foreground truncate">{nama}</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sb.cls}`}>{sb.label}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Kursi {p.kursi.length ? p.kursi.join(", ") : "—"} · {formatRupiah(p.total_amount)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0 mt-1">{idx + 1}.</span>
                    </div>

                    {p.pickup_label && (
                      <div className="flex items-start gap-1.5 mt-2 ml-11">
                        <MapPin className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-muted-foreground leading-snug">{p.pickup_label}</p>
                      </div>
                    )}

                    {p.catatan && (
                      <div className="ml-11 mt-1.5 bg-amber-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-[11px] text-amber-800 italic">"{p.catatan}"</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2.5 ml-11">
                      <button
                        onClick={() => openChat(p.booking_id)}
                        disabled={busyChat === p.booking_id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px] font-semibold transition-colors disabled:opacity-50"
                      >
                        {busyChat === p.booking_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                        Chat
                      </button>
                      <button
                        onClick={() => openPhone(p.penumpang?.no_whatsapp ?? null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" /> Telp
                      </button>
                      <button
                        onClick={() => openMap(p)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold transition-colors"
                      >
                        <MapIcon className="w-3.5 h-3.5" /> Peta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            <p className="text-[11px] text-muted-foreground">Total pendapatan</p>
            <p className="text-sm font-bold text-foreground">{formatRupiah(data.total_pendapatan)}</p>
          </div>
        </div>

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

        {btn ? (
          <button
            onClick={advanceProgress}
            disabled={busyTrip}
            className="w-full py-4 rounded-2xl bg-[#a85e28] text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-[#92501f] disabled:opacity-60 transition-colors shadow-sm"
          >
            {busyTrip ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {btn}
          </button>
        ) : (
          <div className="w-full py-4 rounded-2xl bg-green-50 text-green-700 font-bold text-base flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Trip Selesai
          </div>
        )}
      </div>
    </div>
  );
}
