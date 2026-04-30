import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Bell, Users, Package, Bus, Sparkles, ArrowDownLeft, Hourglass,
  Search, ChevronRight, ChevronDown, Home, MessageCircle,
  ShoppingBag, User, Ticket, MapPin, Phone, Clock4, CheckCircle2, Navigation, XCircle, Loader2
} from "lucide-react";

const RUTE_POPULER = [
  { from: "Samarinda", to: "Balikpapan", duration: "~3 jam" },
  { from: "Balikpapan", to: "Bontang", duration: "~4.5 jam" },
  { from: "Samarinda", to: "Sangatta", duration: "~5 jam" },
  { from: "Bontang", to: "Wahau", duration: "~3 jam" },
];

const DESTINASI_WISATA = [
  {
    nama: "Pulau Derawan",
    kota: "Berau",
    tagline: "Surga bawah laut",
    jarak: "~12 jam dari Samarinda",
    emoji: "🏝️",
    grad: "linear-gradient(135deg, #0f7b8c 0%, #155e75 60%, #1e3a5f 100%)",
  },
  {
    nama: "Danau Labuan Cermin",
    kota: "Berau",
    tagline: "Air dua lapis unik",
    jarak: "~14 jam dari Samarinda",
    emoji: "💎",
    grad: "linear-gradient(135deg, #0d9488 0%, #0f766e 60%, #134e4a 100%)",
  },
  {
    nama: "Pantai Pasir Panjang",
    kota: "Berau",
    tagline: "Pantai eksotis tersembunyi",
    jarak: "~13 jam dari Samarinda",
    emoji: "🌊",
    grad: "linear-gradient(135deg, #b45309 0%, #92400e 60%, #78350f 100%)",
  },
  {
    nama: "Air Terjun Tanah Merah",
    kota: "Kutai Barat",
    tagline: "Keindahan alam pedalaman",
    jarak: "~8 jam dari Samarinda",
    emoji: "💧",
    grad: "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 60%, #1e293b 100%)",
  },
  {
    nama: "Kebun Raya Samarinda",
    kota: "Samarinda",
    tagline: "Hijau di jantung kota",
    jarak: "Di Samarinda",
    emoji: "🌿",
    grad: "linear-gradient(135deg, #16a34a 0%, #15803d 60%, #14532d 100%)",
  },
];
import { useAuth } from "@/contexts/auth";
import { useNotifications } from "@/contexts/notifications";

interface MyBooking {
  id: number;
  status: string;
  kursi: string[];
  pickup_confirmed_at: string | null;
  dropoff_confirmed_at: string | null;
  schedule: {
    id: number;
    origin_city: string;
    destination_city: string;
    departure_date: string;
    departure_time: string;
    trip_progress: string;
  } | null;
  driver: { id: number; nama: string; no_whatsapp: string | null } | null;
}

function activeStage(b: MyBooking): { label: string; tone: string; Icon: any } {
  if (b.status === "batal") return { label: "Dibatalkan", tone: "bg-red-100 text-red-800", Icon: XCircle };
  if (b.status === "pending") return { label: "Menunggu pembayaran", tone: "bg-amber-100 text-amber-800", Icon: Clock4 };
  const tp = b.schedule?.trip_progress ?? "belum_jemput";
  if (b.status === "selesai" || tp === "selesai") return { label: "Trip selesai", tone: "bg-green-100 text-green-800", Icon: CheckCircle2 };
  if (tp === "dalam_perjalanan") return { label: "Dalam perjalanan", tone: "bg-indigo-100 text-indigo-800", Icon: Navigation };
  if (tp === "sudah_jemput") return { label: "Mitra menuju lokasi Anda", tone: "bg-blue-100 text-blue-800", Icon: CheckCircle2 };
  return { label: "Menunggu mitra menjemput", tone: "bg-amber-100 text-amber-800", Icon: Clock4 };
}

function shortDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
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

const LAYANAN_TOP = [
  {
    id: "travel",
    icon: <Users className="w-5 h-5" />,
    label: "Travel Penumpang",
    color: "amber",
    active: true,
  },
  {
    id: "titip",
    icon: <Package className="w-5 h-5" />,
    label: "Titip Barang",
    color: "green",
    active: false,
  },
];

const LAYANAN_LIST = [
  {
    id: "jadwal",
    icon: <Bus className="w-5 h-5" />,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
    label: "Jadwal Tetap",
    desc: "Jam & tanggal ditentukan mitra",
    disabled: false,
    badge: null,
  },
  {
    id: "carter",
    icon: <Sparkles className="w-5 h-5" />,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
    label: "Carter",
    desc: "Sewa penuh, jam bebas kamu tentukan",
    disabled: false,
    badge: null,
  },
  {
    id: "tebengan",
    icon: <ArrowDownLeft className="w-5 h-5" />,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    label: "Tebengan Pulang",
    desc: "Ikut driver pulang kosong, harga miring",
    disabled: true,
    badge: "SEGERA HADIR",
  },
  {
    id: "tunggu",
    icon: <Hourglass className="w-5 h-5" />,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    label: "Tunggu Penuh",
    desc: "Harga lebih murah dengan mode fleksibel",
    disabled: true,
    badge: "SEGERA HADIR",
  },
];

const BOTTOM_NAV = [
  { id: "beranda", icon: Home, label: "Beranda", active: true },
  { id: "chat", icon: MessageCircle, label: "Chat", active: false },
  { id: "pesanan", icon: ShoppingBag, label: "Pesanan", active: false },
  { id: "akun", icon: User, label: "Akun", active: false },
];

export default function DashboardPenumpang() {
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const { unreadCount } = useNotifications();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [activeTrip, setActiveTrip] = useState<MyBooking | null>(null);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState<"pickup" | "dropoff" | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function reloadActiveTrip() {
    if (!token) return;
    const res = await fetch(`${apiBase}/bookings/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const list: MyBooking[] = await res.json();
    const active = list
      .filter(
        (b) =>
          ["pending", "paid", "aktif"].includes(b.status) &&
          !!b.schedule &&
          b.schedule.trip_progress !== "selesai",
      )
      .sort((a, b) => {
        const da = `${a.schedule?.departure_date}T${a.schedule?.departure_time}`;
        const db = `${b.schedule?.departure_date}T${b.schedule?.departure_time}`;
        return da.localeCompare(db);
      })[0];
    setActiveTrip(active ?? null);
  }

  async function confirmAction(kind: "pickup" | "dropoff") {
    if (!activeTrip || !token) return;
    setConfirmError(null);
    setConfirmBusy(kind);
    try {
      const path =
        kind === "pickup"
          ? `/bookings/${activeTrip.id}/confirm-pickup`
          : `/bookings/${activeTrip.id}/confirm-dropoff`;
      const res = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setConfirmError(j.error ?? "Gagal mengirim konfirmasi.");
      } else {
        await reloadActiveTrip();
      }
    } catch {
      setConfirmError("Tidak bisa terhubung ke server.");
    } finally {
      setConfirmBusy(null);
    }
  }

  useEffect(() => {
    if (!token || user?.role !== "penumpang") return;
    let cancelled = false;
    async function load() {
      setTripsLoading(true);
      try {
        const res = await fetch(`${apiBase}/bookings/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const list: MyBooking[] = await res.json();
        // Pick still-active booking with earliest upcoming travel date
        const active = list
          .filter(
            (b) =>
              ["pending", "paid", "aktif"].includes(b.status) &&
              !!b.schedule &&
              b.schedule.trip_progress !== "selesai",
          )
          .sort((a, b) => {
            const da = `${a.schedule?.departure_date}T${a.schedule?.departure_time}`;
            const db = `${b.schedule?.departure_date}T${b.schedule?.departure_time}`;
            return da.localeCompare(db);
          })[0];
        if (!cancelled) setActiveTrip(active ?? null);
      } finally {
        if (!cancelled) setTripsLoading(false);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [token, apiBase, user?.role]);

  return (
    <div className="min-h-screen bg-[#f0ece4] flex flex-col max-w-md mx-auto relative">
      {/* ── HERO HEADER ── */}
      <div
        className="relative px-5 pt-10 pb-6"
        style={{
          background: "linear-gradient(135deg, #7dd3fc 0%, #38bdf8 35%, #0ea5e9 65%, #0369a1 100%)",
        }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-white/70 uppercase flex items-center gap-1.5">
              {getGreetingEmoji()} {getGreeting()}
            </p>
            <p className="text-lg font-bold text-white mt-0.5" data-testid="user-name">
              {user?.nama ?? "Penumpang"}
            </p>
          </div>
          <button
            data-testid="notif-btn"
            onClick={() => setLocation("/notifikasi")}
            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm relative"
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Heading */}
        <h1 className="text-4xl font-bold text-white leading-tight mb-1">
          Mau ke{" "}
          <span
            className="italic"
            style={{ fontFamily: "var(--app-font-serif)" }}
          >
            mana?
          </span>
        </h1>
        <p className="text-sm text-white/75 mb-5">
          Travel dari driver pribadi di Kaltim —{" "}
          <em>langsung, transparan.</em>
        </p>

        {/* CTA: Cari Travel */}
        <button
          data-testid="cari-cta"
          onClick={() => setLocation("/cari")}
          className="w-full bg-white/95 hover:bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Search className="w-4 h-4 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">Cari Travel</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Pilih rute & tanggal untuk lihat jadwal tersedia</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>

        {/* Curved bottom */}
        <div
          className="absolute -bottom-4 left-0 right-0 h-8 bg-[#f0ece4]"
          style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
        />
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div className="flex-1 overflow-y-auto pb-24 pt-2">

        {/* ── ACTIVE TRIP CARD ── */}
        {activeTrip && activeTrip.schedule && (() => {
          const stage = activeStage(activeTrip);
          const StageIcon = stage.Icon;
          return (
            <section className="px-5 mb-4 mt-1" data-testid="active-trip-section">
              <div
                className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm cursor-pointer active:opacity-80 transition-opacity"
                onClick={() => setLocation(`/booking/${activeTrip.id}/etiket`)}
              >
                <div className="px-4 py-2 bg-foreground text-card flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold tracking-widest uppercase">Trip Aktif</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${stage.tone}`}>
                    <StageIcon className="w-3 h-3 inline mr-1" />
                    {stage.label}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-amber-700 flex-shrink-0" />
                    <p className="text-sm font-bold text-foreground" data-testid="active-trip-route">
                      {activeTrip.schedule.origin_city} <span className="text-muted-foreground font-normal">→</span> {activeTrip.schedule.destination_city}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground ml-6">
                    <span>{shortDate(activeTrip.schedule.departure_date)}</span>
                    <span>·</span>
                    <span>{activeTrip.schedule.departure_time}</span>
                    <span>·</span>
                    <span>Kursi {activeTrip.kursi.join(", ")}</span>
                  </div>
                  {activeTrip.driver && (
                    <p className="text-[11px] text-muted-foreground ml-6 mt-1">
                      Mitra: <span className="font-semibold text-foreground">{activeTrip.driver.nama}</span>
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      data-testid="active-trip-tiket"
                      onClick={() => setLocation(`/booking/${activeTrip.id}/etiket`)}
                      className="py-2.5 rounded-xl bg-[#a85e28] text-white text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Ticket className="w-3.5 h-3.5" /> Tiket
                    </button>
                    <button
                      data-testid="active-trip-chat"
                      onClick={async () => {
                        if (!token) return;
                        const r = await fetch(`${apiBase}/chat/threads`, {
                          method: "POST",
                          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                          body: JSON.stringify({ booking_type: "schedule", booking_id: activeTrip.id }),
                        });
                        const j = await r.json();
                        if (r.ok && j.id) setLocation(`/chat/${j.id}`);
                      }}
                      className="py-2.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> Chat
                    </button>
                    <a
                      data-testid="active-trip-telp"
                      href={activeTrip.driver?.no_whatsapp ? `tel:${activeTrip.driver.no_whatsapp}` : "#"}
                      onClick={(e) => { e.stopPropagation(); if (!activeTrip.driver?.no_whatsapp) e.preventDefault(); }}
                      className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${
                        activeTrip.driver?.no_whatsapp ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground cursor-not-allowed"
                      }`}
                    >
                      <Phone className="w-3.5 h-3.5" /> Telp
                    </a>
                  </div>

                  {/* Konfirmasi sudah dijemput / trip selesai */}
                  {(() => {
                    const tp = activeTrip.schedule?.trip_progress ?? "belum_jemput";
                    const showPickup =
                      (tp === "sudah_jemput" || tp === "dalam_perjalanan" || tp === "selesai") &&
                      !activeTrip.pickup_confirmed_at;
                    const showDropoff =
                      tp === "selesai" && !activeTrip.dropoff_confirmed_at;

                    if (showPickup) {
                      return (
                        <button
                          data-testid="active-trip-confirm-pickup"
                          disabled={confirmBusy === "pickup"}
                          onClick={(e) => { e.stopPropagation(); confirmAction("pickup"); }}
                          className="w-full mt-3 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                        >
                          {confirmBusy === "pickup" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Konfirmasi sudah dijemput
                        </button>
                      );
                    }
                    if (showDropoff) {
                      return (
                        <button
                          data-testid="active-trip-confirm-dropoff"
                          disabled={confirmBusy === "dropoff"}
                          onClick={(e) => { e.stopPropagation(); confirmAction("dropoff"); }}
                          className="w-full mt-3 py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                        >
                          {confirmBusy === "dropoff" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Konfirmasi trip selesai
                        </button>
                      );
                    }
                    if (activeTrip.pickup_confirmed_at && tp !== "selesai") {
                      return (
                        <p className="text-[11px] text-blue-700 text-center mt-2.5" data-testid="active-trip-pickup-note">
                          ✓ Anda mengonfirmasi sudah dijemput
                        </p>
                      );
                    }
                    if (activeTrip.dropoff_confirmed_at) {
                      return (
                        <p className="text-[11px] text-green-700 text-center mt-2.5" data-testid="active-trip-dropoff-note">
                          ✓ Anda mengonfirmasi sudah sampai tujuan
                        </p>
                      );
                    }
                    return null;
                  })()}
                  {confirmError && (
                    <p className="text-[11px] text-red-600 text-center mt-2" data-testid="active-trip-confirm-error">
                      {confirmError}
                    </p>
                  )}
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── LAYANAN ── */}
        <section className="px-5 mb-6">
          <h2 className="text-xl font-bold text-foreground mb-3">Layanan</h2>

          {/* Top 2 cards */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {LAYANAN_TOP.map((item) => (
              <button
                key={item.id}
                data-testid={`layanan-${item.id}`}
                className={`flex flex-col items-start gap-2 p-4 rounded-2xl border-2 bg-card text-left transition-all ${
                  item.active
                    ? "border-amber-400"
                    : "border-border"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    item.active
                      ? "bg-amber-50 text-amber-600"
                      : "bg-green-50 text-green-600"
                  }`}
                >
                  {item.icon}
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-semibold text-foreground leading-snug">
                    {item.label}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>

          {/* List items */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {LAYANAN_LIST.map((item, i) => (
              <button
                key={item.id}
                data-testid={`layanan-${item.id}`}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  if (item.id === "carter") {
                    setLocation("/carter/cari");
                  } else if (item.id === "tebengan" || item.id === "jadwal") {
                    setLocation("/cari");
                  }
                }}
                className={`w-full flex items-center gap-3.5 px-4 py-4 text-left transition-colors ${
                  i < LAYANAN_LIST.length - 1 ? "border-b border-border" : ""
                } ${item.disabled ? "opacity-50" : "hover:bg-muted/30 active:bg-muted/60"}`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.iconBg} ${item.iconColor}`}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${item.disabled ? "text-muted-foreground" : "text-foreground"}`}>
                      {item.label}
                    </p>
                    {item.badge && (
                      <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.desc}</p>
                </div>
                {!item.disabled && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </button>
            ))}
          </div>
        </section>

        {/* ── RUTE POPULER ── */}
        <section className="px-5 mb-6">
          <h2 className="text-xl font-bold text-foreground mb-3">Rute Populer</h2>
          <div className="grid grid-cols-2 gap-3">
            {RUTE_POPULER.map((r) => (
              <button
                key={`${r.from}-${r.to}`}
                onClick={() => setLocation("/cari")}
                className="bg-card rounded-2xl p-3.5 border border-border shadow-sm text-left hover:bg-muted/30 transition-colors active:scale-[0.98]"
              >
                <p className="text-sm font-bold text-foreground leading-snug">
                  {r.from} <span className="text-muted-foreground font-normal">→</span> {r.to}
                </p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1.5">
                  <Clock4 className="w-3 h-3" /> {r.duration}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* ── DESTINASI WISATA ── */}
        <section className="mb-6">
          <div className="px-5 flex items-end justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">Destinasi Wisata</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Tempat favorit di Kalimantan Timur</p>
            </div>
            <button
              onClick={() => setLocation("/carter/cari")}
              className="text-xs font-bold text-accent"
            >
              Lihat Semua
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide" style={{ scrollSnapType: "x mandatory" }}>
            {DESTINASI_WISATA.map((d) => (
              <button
                key={d.nama}
                onClick={() => setLocation("/carter/cari")}
                className="flex-shrink-0 rounded-2xl overflow-hidden text-left relative"
                style={{
                  width: 200,
                  height: 240,
                  background: d.grad,
                  scrollSnapAlign: "start",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: "radial-gradient(circle at 60% 40%, rgba(255,255,255,0.05) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }}
                />
                <div className="relative p-4 flex flex-col h-full">
                  <div className="flex items-start justify-between">
                    <span className="bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full">
                      {d.kota}
                    </span>
                    <span className="text-3xl leading-none">{d.emoji}</span>
                  </div>
                  <div className="mt-auto">
                    <h3 className="text-white font-bold text-lg leading-snug">{d.nama}</h3>
                    <p className="text-white/75 text-xs mt-0.5">{d.tagline}</p>
                    <p className="flex items-center gap-1 text-white/60 text-[11px] mt-2">
                      <MapPin className="w-3 h-3" /> {d.jarak}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── PROMO CARTER ── */}
        <section className="px-5 mb-6">
          <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Travel liburan? Carter bisa!</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Booking rombongan ke destinasi wisata</p>
            </div>
            <button
              onClick={() => setLocation("/carter/cari")}
              className="flex-shrink-0 bg-foreground text-card text-xs font-bold px-3.5 py-2 rounded-xl"
            >
              Carter
            </button>
          </div>
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
              }}
              className="flex flex-col items-center gap-1 px-4 py-1"
            >
              <nav.icon
                className="w-5 h-5"
                style={{ color: nav.active ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))" }}
              />
              <span
                className="text-[10px] font-semibold"
                style={{ color: nav.active ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))" }}
              >
                {nav.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
