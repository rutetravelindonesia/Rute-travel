import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Bell, Bus, Sparkles, ArrowDownLeft, Hourglass,
  LayoutGrid, CalendarDays, MessageCircle, ShoppingBag, User,
  Navigation, Users, MapPin, Lock
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useNotifications } from "@/contexts/notifications";
import { useLogout } from "@workspace/api-client-react";
import OfflineSeatPicker from "@/components/offline-seat-picker";

function getInitials(nama: string) {
  return nama
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function shortName(nama: string) {
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return "SELAMAT PAGI";
  if (h < 15) return "SELAMAT SIANG";
  if (h < 18) return "SELAMAT SORE";
  return "SELAMAT MALAM";
}

function getGreetingEmoji() {
  const h = new Date().getHours();
  if (h < 11) return "☀️";
  if (h < 15) return "🌤️";
  if (h < 18) return "🌆";
  return "🌙";
}

interface TebenganMine {
  id: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  max_kursi: number;
  price_per_seat: number;
  status: string;
  kursi_terisi: number;
  kursi_tersisa: number;
  pendapatan: number;
  penumpang: { id: number; nama: string; jumlah_kursi: number }[];
  kendaraan: { id: number; merek: string; model: string; plat_nomor: string } | null;
  trip_kind: "tebengan";
}

interface JadwalMine {
  id: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  max_kursi: number;
  capacity: number;
  price_per_seat: number;
  status: string;
  kursi_terisi: number;
  kursi_tersisa: number;
  kursi_offline: string[];
  kursi_booked: string[];
  pendapatan: number;
  penumpang: { id: number; nama: string; jumlah_kursi: number }[];
  kendaraan: { id: number; merek: string; model: string; plat_nomor: string } | null;
  trip_kind: "jadwal";
  trip_progress: string;
}

type AnyTrip = TebenganMine | JadwalMine;

const ATUR_JADWAL = [
  {
    id: "jadwal-tetap",
    icon: <Bus className="w-5 h-5" />,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
    label: "Jadwal Tetap",
    desc: "Atur rute & jam keberangkatan",
    disabled: false,
    badge: null,
    path: "/jadwal-tetap/buat",
  },
  {
    id: "carter",
    icon: <Sparkles className="w-5 h-5" />,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
    label: "Carter",
    desc: "Terima carter, jam fleksibel sesuai pemesan",
    disabled: false,
    badge: null,
    path: "/carter/atur",
  },
  {
    id: "tebengan",
    icon: <ArrowDownLeft className="w-5 h-5" />,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    label: "Tebengan Pulang",
    desc: "Tawarkan kursi kosong saat pulang",
    disabled: true,
    badge: "SEGERA HADIR",
    path: null,
  },
  {
    id: "tunggu-penuh",
    icon: <Hourglass className="w-5 h-5" />,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    label: "Tunggu Penuh",
    desc: "Berangkat ketika semua kursi terisi",
    disabled: true,
    badge: "SEGERA HADIR",
    path: null,
  },
];

const BOTTOM_NAV = [
  { id: "dashboard", icon: LayoutGrid, label: "Dashboard", active: true },
  { id: "jadwal", icon: CalendarDays, label: "Jadwal", active: false },
  { id: "chat", icon: MessageCircle, label: "Chat", active: false },
  { id: "pesanan", icon: ShoppingBag, label: "Pesanan", active: false },
  { id: "akun", icon: User, label: "Akun", active: false },
];

function statusLabel(s: string) {
  if (s === "aktif") return { label: "Menunggu", cls: "bg-amber-50 text-amber-700" };
  if (s === "berangkat") return { label: "Berangkat", cls: "bg-blue-50 text-blue-700" };
  return { label: s, cls: "bg-muted text-muted-foreground" };
}

function progressLabel(p: string) {
  if (p === "belum_jemput") return { label: "Belum berangkat", cls: "bg-amber-50 text-amber-700" };
  if (p === "sudah_jemput") return { label: "Menuju jemput", cls: "bg-blue-50 text-blue-700" };
  if (p === "semua_naik") return { label: "Semua Penumpang Naik", cls: "bg-violet-50 text-violet-700" };
  if (p === "dalam_perjalanan") return { label: "Dalam perjalanan", cls: "bg-blue-50 text-blue-700" };
  if (p === "selesai") return { label: "Selesai", cls: "bg-green-50 text-green-700" };
  return { label: p, cls: "bg-muted text-muted-foreground" };
}

export default function DashboardDriver() {
  const [, setLocation] = useLocation();
  const { user, token, clearAuth } = useAuth();
  const { unreadCount } = useNotifications();
  const logoutMutation = useLogout();

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [trips, setTrips] = useState<AnyTrip[] | null>(null);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [offlineModal, setOfflineModal] = useState<JadwalMine | null>(null);

  const loadTrips = useCallback(async () => {
    if (!token) {
      setTrips([]);
      setTripsLoading(false);
      return;
    }
    setTripsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [tebRes, jdwRes] = await Promise.all([
        fetch(`${apiBase}/tebengan/mine`, { headers }),
        fetch(`${apiBase}/schedules/mine`, { headers }),
      ]);

      const tebList: TebenganMine[] = tebRes.ok
        ? ((await tebRes.json()) as Omit<TebenganMine, "trip_kind">[]).map((t) => ({
            ...t,
            trip_kind: "tebengan" as const,
          }))
        : [];
      const jdwListRaw: Omit<JadwalMine, "trip_kind">[] = jdwRes.ok
        ? await jdwRes.json()
        : [];

      const todayStr = new Date(Date.now() + 8 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);

      const jdwList: JadwalMine[] = jdwListRaw
        .filter(
          (j) =>
            j.departure_date >= todayStr &&
            j.trip_progress !== "selesai" &&
            j.status === "active",
        )
        .map((j) => ({ ...j, trip_kind: "jadwal" as const }));

      const tebAktif = tebList.filter(
        (t) => t.status === "aktif" || t.status === "berangkat",
      );

      const merged: AnyTrip[] = [...tebAktif, ...jdwList].sort((a, b) => {
        const dateCmp = a.departure_date.localeCompare(b.departure_date);
        if (dateCmp !== 0) return dateCmp;
        return a.departure_time.localeCompare(b.departure_time);
      });
      setTrips(merged);
    } catch {
      setTrips([]);
    } finally {
      setTripsLoading(false);
    }
  }, [token, apiBase]);

  useEffect(() => {
    loadTrips();
    const interval = setInterval(loadTrips, 20_000);
    return () => clearInterval(interval);
  }, [loadTrips]);

  const initials = user?.nama ? getInitials(user.nama) : "DR";

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => { clearAuth(); setLocation("/login"); },
      onError: () => { clearAuth(); setLocation("/login"); },
    });
  };

  async function advanceJadwal(id: number) {
    if (!token) return;
    const res = await fetch(`${apiBase}/schedules/${id}/trip-progress`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) loadTrips();
  }

  async function setTripStatus(id: number, status: "berangkat" | "selesai") {
    if (!token) return;
    const res = await fetch(`${apiBase}/tebengan/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (res.ok) loadTrips();
  }

  return (
    <div className="min-h-screen bg-[#f0ece4] flex flex-col max-w-md mx-auto relative">

      {/* ── HERO HEADER ── */}
      <div
        className="relative px-5 pt-10 pb-6"
        style={{
          background:
            "linear-gradient(135deg, #e8b86d 0%, #d4975a 35%, #c07840 65%, #a85e28 100%)",
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold tracking-widest text-white/70 uppercase flex items-center gap-1.5">
              {getGreetingEmoji()} {getGreeting()}
            </p>
            <p
              className="text-lg font-bold text-white mt-0.5 truncate"
              data-testid="driver-name"
            >
              {user?.nama ?? "Mitra Driver"}
            </p>
          </div>
          <button
            data-testid="notif-btn"
            onClick={() => setLocation("/notifikasi")}
            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm flex-shrink-0 relative"
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-300" />
          <span className="text-[10px] font-bold tracking-widest text-white uppercase">
            Mode Mitra
          </span>
        </div>

        {/* Curved bottom */}
        <div
          className="absolute -bottom-4 left-0 right-0 h-8 bg-[#f0ece4]"
          style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
        />
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div className="flex-1 overflow-y-auto pb-24">

        {/* ── ATUR JADWAL ── */}
        <section className="px-5 pt-4 pb-1">
          <h2 className="text-xl font-bold text-foreground mb-3">Atur Jadwal</h2>

          <div className="grid grid-cols-2 gap-3">
            {ATUR_JADWAL.map((item) => (
              <button
                key={item.id}
                data-testid={`jadwal-${item.id}`}
                disabled={item.disabled}
                onClick={() => item.path && setLocation(item.path)}
                className={`flex flex-col items-start gap-2.5 p-4 rounded-2xl border border-border bg-card text-left transition-all ${
                  item.disabled ? "opacity-50" : "hover:border-amber-300 active:scale-[0.97]"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.iconBg} ${item.iconColor}`}
                >
                  {item.icon}
                </div>
                <div className="w-full">
                  <p className={`text-sm font-semibold leading-snug ${item.disabled ? "text-muted-foreground" : "text-foreground"}`}>
                    {item.label}
                  </p>
                  {item.badge ? (
                    <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase mt-1 inline-block">
                      {item.badge}
                    </span>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.desc}</p>
                  )}
                </div>
                {!item.disabled && (
                  <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center">
                    <span className="text-muted-foreground text-xs font-bold">+</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* ── JADWAL PERJALANAN AKTIF ── */}
        <section className="px-5 pt-5 pb-2">
          <div className="flex items-end justify-between gap-3 mb-3">
            <h2 className="text-xl font-bold text-foreground leading-tight flex-1">
              Jadwal Perjalanan Terdekat
            </h2>
            {trips && trips.length > 0 && (
              <button
                data-testid="link-lihat-semua-jadwal"
                onClick={() => setLocation("/jadwal")}
                className="text-sm font-semibold flex-shrink-0 pb-0.5"
                style={{ color: "hsl(var(--accent))" }}
              >
                Lihat semua
              </button>
            )}
          </div>

          {tripsLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
            </div>
          ) : !trips || trips.length === 0 ? (
            <div className="bg-card rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm font-semibold text-foreground">Belum ada perjalanan aktif</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Buat <span className="font-semibold">Jadwal Tetap</span> atau terima <span className="font-semibold">Carter</span> untuk mulai menerima penumpang.
              </p>
              <button
                onClick={() => setLocation("/jadwal-tetap/buat")}
                className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold"
              >
                Buat Jadwal Tetap
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.slice(0, 1).map((trip) => {
                const isJadwal = trip.trip_kind === "jadwal";
                const max_kursi = isJadwal ? (trip as JadwalMine).capacity ?? trip.max_kursi : trip.max_kursi;
                const stat = isJadwal
                  ? progressLabel((trip as JadwalMine).trip_progress)
                  : statusLabel(trip.status);
                const isPenuh = trip.kursi_terisi === max_kursi;
                const tipeBadge = isJadwal
                  ? { label: "Jadwal Tetap", cls: "bg-orange-100 text-orange-700" }
                  : { label: "Tebengan Pulang", cls: "bg-green-100 text-green-700" };
                const waktuLabel = isJadwal ? "Komitmen" : "Perkiraan";
                const waktuPrefix = isJadwal ? "" : "~";
                return (
                  <div
                    key={`${trip.trip_kind}-${trip.id}`}
                    data-testid={`trip-${trip.trip_kind}-${trip.id}`}
                    className="bg-card rounded-2xl border border-border overflow-hidden"
                  >
                    <div className="flex">
                      <div
                        className="w-1.5 flex-shrink-0"
                        style={{ backgroundColor: "hsl(var(--accent))" }}
                      />
                      <div className="flex-1 p-4">

                        {/* Row 1: waktu + rute + tipe + status */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="bg-muted rounded-xl px-3 py-2 flex-shrink-0 text-center min-w-[58px]">
                            <p className="text-[8px] font-bold tracking-wider text-muted-foreground uppercase leading-none mb-0.5">{waktuLabel}</p>
                            <p className="text-sm font-bold text-foreground tabular-nums leading-none">{waktuPrefix}{trip.departure_time}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{trip.departure_date}</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-bold text-foreground leading-tight">
                              {trip.origin_city}{" "}
                              <span className="text-muted-foreground font-normal">→</span>{" "}
                              {trip.destination_city}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tipeBadge.cls}`}
                              >
                                {tipeBadge.label}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stat.cls}`}
                              >
                                {stat.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Row 2: kendaraan */}
                        {trip.kendaraan && (
                          <div className="flex items-start gap-2 mb-3 p-2.5 rounded-xl bg-muted/50">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground leading-snug">
                              {trip.kendaraan.merek} {trip.kendaraan.model} · {trip.kendaraan.plat_nomor}
                            </p>
                          </div>
                        )}

                        {/* Row 3: kursi + pendapatan + penumpang */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {trip.kursi_terisi}/{max_kursi} kursi terisi
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-green-600">
                              {formatRupiah(trip.pendapatan)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (trip.kursi_terisi / max_kursi) * 100)}%`,
                                backgroundColor: isPenuh ? "hsl(142 71% 45%)" : "hsl(var(--accent))",
                              }}
                            />
                          </div>
                          {trip.penumpang.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {trip.penumpang.map((p) => (
                                <span
                                  key={p.id}
                                  className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-foreground"
                                >
                                  {shortName(p.nama)}
                                  {p.jumlah_kursi > 1 ? ` ×${p.jumlah_kursi}` : ""}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground italic">Belum ada penumpang.</p>
                          )}
                        </div>

                        {/* CTA button */}
                        {isJadwal ? (() => {
                          const j = trip as JadwalMine;
                          const tp = j.trip_progress;
                          const advanceLabel: Record<string, string | null> = {
                            belum_jemput: "Mulai Jemput",
                            sudah_jemput: "Penumpang Sudah Naik",
                            semua_naik: "Berangkat ke Kota Tujuan",
                            dalam_perjalanan: "Tandai Selesai",
                            selesai: null,
                          };
                          const nextLabel = advanceLabel[tp];
                          const offlineCount = (j.kursi_offline ?? []).length;
                          return (
                            <div className="space-y-2">
                              <button
                                data-testid={`btn-offline-jadwal-${j.id}`}
                                onClick={() => setOfflineModal(j)}
                                className="w-full py-2.5 rounded-xl border border-dashed border-border text-xs font-semibold text-foreground flex items-center justify-center gap-2 bg-muted/30"
                              >
                                <Lock className="w-3.5 h-3.5 text-green-700" />
                                {offlineCount > 0
                                  ? `${offlineCount} penumpang offline · Ubah`
                                  : "Catat Penumpang Offline"}
                              </button>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  data-testid={`btn-detail-jadwal-${j.id}`}
                                  onClick={() => setLocation("/jadwal")}
                                  className="py-3 rounded-xl border border-border text-sm font-semibold text-foreground"
                                >
                                  Detail
                                </button>
                                {nextLabel ? (
                                  <button
                                    data-testid={`btn-advance-jadwal-${j.id}`}
                                    onClick={() => advanceJadwal(j.id)}
                                    className="py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                                    style={{ backgroundColor: "hsl(var(--accent))" }}
                                  >
                                    <Navigation className="w-4 h-4" />
                                    {nextLabel}
                                  </button>
                                ) : (
                                  <button
                                    disabled
                                    className="py-3 rounded-xl bg-muted text-muted-foreground text-sm font-bold"
                                  >
                                    Selesai
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })() : trip.status === "aktif" ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              data-testid={`btn-detail-${trip.id}`}
                              onClick={() => setLocation(`/tebengan/${trip.id}`)}
                              className="py-3 rounded-xl border border-border text-sm font-semibold text-foreground"
                            >
                              Detail
                            </button>
                            <button
                              data-testid={`btn-berangkat-${trip.id}`}
                              onClick={() => setTripStatus(trip.id, "berangkat")}
                              className="py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                              style={{ backgroundColor: "hsl(var(--accent))" }}
                            >
                              <Navigation className="w-4 h-4" />
                              Berangkat
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              data-testid={`btn-detail-${trip.id}`}
                              onClick={() => setLocation(`/tebengan/${trip.id}`)}
                              className="py-3 rounded-xl border border-border text-sm font-semibold text-foreground"
                            >
                              Detail
                            </button>
                            <button
                              data-testid={`btn-selesai-${trip.id}`}
                              onClick={() => setTripStatus(trip.id, "selesai")}
                              className="py-3 rounded-xl bg-foreground text-background text-sm font-bold"
                            >
                              Tandai Selesai
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* ── BOTTOM NAVIGATION ── */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border"
        style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center justify-around px-2 py-3">
          {BOTTOM_NAV.map((nav) => (
            <button
              key={nav.id}
              data-testid={`nav-${nav.id}`}
              onClick={() => {
                if (nav.id === "akun") setLocation("/profil");
                if (nav.id === "chat") setLocation("/chat");
                if (nav.id === "pesanan") setLocation("/pesanan");
                if (nav.id === "jadwal") setLocation("/jadwal");
              }}
              className="flex flex-col items-center gap-1 px-3 py-1"
            >
              <nav.icon
                className="w-5 h-5"
                style={{
                  color: nav.active ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))",
                }}
              />
              <span
                className="text-[10px] font-semibold"
                style={{
                  color: nav.active ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))",
                }}
              >
                {nav.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {offlineModal && (
        <OfflineSeatPicker
          open={true}
          scheduleId={offlineModal.id}
          capacity={offlineModal.capacity ?? offlineModal.max_kursi}
          initialOffline={offlineModal.kursi_offline ?? []}
          bookedSeats={offlineModal.kursi_booked ?? []}
          apiBase={apiBase}
          token={token}
          onClose={() => setOfflineModal(null)}
          onSaved={loadTrips}
        />
      )}
    </div>
  );
}
