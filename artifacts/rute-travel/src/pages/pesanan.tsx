import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Home,
  MessageCircle,
  ShoppingBag,
  User as UserIcon,
  LayoutGrid,
  CalendarDays,
  Loader2,
  Calendar,
  Clock4,
  MapPin,
  ChevronRight,
  Inbox,
  ArrowLeft,
  Phone,
  Map as MapIcon,
  CheckCircle2,
  Ticket,
  Star,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";

type Status = "pending" | "paid" | "aktif" | "selesai" | "batal" | string;

interface UnifiedOrder {
  trip_progress?: string;
  key: string;
  id: number;
  type: "schedule" | "carter";
  origin_city: string;
  destination_city: string;
  travel_date: string;
  travel_time: string;
  total_amount: number;
  status: Status;
  created_at: string;
  counterpart_nama: string | null;
  counterpart_no_wa?: string | null;
  detail_path: string;
  kursi_count?: number;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_label?: string | null;
  carter_trip_progress?: string | null;
  carter_pickup_confirmed?: boolean;
  kendaraan_info?: string | null;
}

interface DriverTripPassenger {
  booking_id: number;
  nama: string;
  kursi: string[];
  status: Status;
  total_amount: number;
  no_whatsapp: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_label: string | null;
  dropoff_label: string | null;
  alighting_city: string | null;
}

type TripProgress = "belum_jemput" | "sudah_jemput" | "dalam_perjalanan" | "selesai" | string;

interface DriverGroupedTrip {
  key: string;
  schedule_id: number;
  origin_city: string;
  destination_city: string;
  travel_date: string;
  travel_time: string;
  passengers: DriverTripPassenger[];
  total_amount: number;
  total_kursi: number;
  latest_created_at: string;
  trip_progress: TripProgress;
}

const ACTIVE: Status[] = ["pending", "paid", "aktif", "confirmed"];
const ARCHIVED: Status[] = ["selesai", "batal", "cancelled"];

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

function statusBadge(s: Status): { label: string; cls: string } {
  switch (s) {
    case "pending":
      return { label: "Menunggu pembayaran", cls: "bg-amber-100 text-amber-800" };
    case "paid":
      return { label: "Menunggu verifikasi", cls: "bg-blue-100 text-blue-800" };
    case "confirmed":
      return { label: "E-Tiket Aktif", cls: "bg-green-100 text-green-800" };
    case "aktif":
      return { label: "Aktif", cls: "bg-green-100 text-green-800" };
    case "selesai":
      return { label: "Selesai", cls: "bg-gray-100 text-gray-700" };
    case "batal":
    case "cancelled":
      return { label: "Dibatalkan", cls: "bg-red-100 text-red-700" };
    default:
      return { label: s, cls: "bg-muted text-muted-foreground" };
  }
}

function penumpangStatusBadge(o: UnifiedOrder): { label: string; cls: string } {
  if (o.status === "confirmed") {
    const tp = o.trip_progress;
    if (tp === "dalam_perjalanan") return { label: "Dalam perjalanan", cls: "bg-indigo-100 text-indigo-800" };
    if (tp === "sudah_jemput") return { label: "Mitra Menuju Jemput", cls: "bg-blue-100 text-blue-800" };
    if (tp === "semua_naik") return { label: "Semua Penumpang Naik", cls: "bg-violet-100 text-violet-800" };
    if (tp === "selesai") return { label: "Trip selesai", cls: "bg-gray-100 text-gray-700" };
    return { label: "E-Tiket Aktif", cls: "bg-green-100 text-green-800" };
  }
  if (o.status !== "aktif") return statusBadge(o.status);
  switch (o.trip_progress) {
    case "sudah_jemput":
      return { label: "Mitra Menuju Jemput", cls: "bg-blue-100 text-blue-800" };
    case "semua_naik":
      return { label: "Semua Sudah Naik", cls: "bg-violet-100 text-violet-800" };
    case "dalam_perjalanan":
      return { label: "Dalam perjalanan", cls: "bg-indigo-100 text-indigo-800" };
    case "selesai":
      return { label: "Trip selesai", cls: "bg-green-100 text-green-800" };
    default:
      return { label: "Menunggu dijemput", cls: "bg-amber-100 text-amber-800" };
  }
}

function carterPenumpangBadge(status: Status, tp: string | null | undefined, pickupConfirmed?: boolean): { label: string; cls: string } {
  if (tp === "menuju_jemput" && pickupConfirmed) return { label: "Sudah Jemput", cls: "bg-violet-100 text-violet-800" };
  if (tp === "menuju_jemput") return { label: "Mitra Menuju Jemput", cls: "bg-blue-100 text-blue-800" };
  if (tp === "sudah_jemput") return { label: "Siap Berangkat", cls: "bg-violet-100 text-violet-800" };
  if (tp === "dalam_perjalanan") return { label: "Dalam Perjalanan", cls: "bg-indigo-100 text-indigo-800" };
  if (tp === "selesai" || status === "selesai") return { label: "Selesai", cls: "bg-gray-100 text-gray-700" };
  if (status === "pending") return { label: "Menunggu Pembayaran", cls: "bg-amber-100 text-amber-800" };
  if (status === "paid") return { label: "Menunggu Verifikasi", cls: "bg-blue-100 text-blue-800" };
  if (status === "confirmed") return { label: "E-Tiket Aktif", cls: "bg-green-100 text-green-800" };
  if (status === "batal" || status === "cancelled") return { label: "Dibatalkan", cls: "bg-red-100 text-red-700" };
  return { label: "Menunggu Mitra Menjemput", cls: "bg-blue-100 text-blue-800" };
}

function formatDate(iso: string) {
  try {
    return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatRupiah(n: number) {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function PesananPage() {
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"aktif" | "riwayat">("aktif");
  const [orders, setOrders] = useState<UnifiedOrder[] | null>(null);
  const [rawSchedBookings, setRawSchedBookings] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyChat, setBusyChat] = useState<number | null>(null);
  const [busyTrip, setBusyTrip] = useState<number | null>(null);
  const [busyCarterTrip, setBusyCarterTrip] = useState<number | null>(null);
  const [busyCarterChat, setBusyCarterChat] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  type PassengerRating = { booking_id: number; penumpang_nama: string; kursi: string[]; rating: { stars: number; comment: string | null } | null };
  const [scheduleRatings, setScheduleRatings] = useState<Map<number, PassengerRating[]>>(new Map());

  // Baca filter jadwal dari URL param (dari halaman Jadwal Mitra)
  const urlParams = new URLSearchParams(window.location.search);
  const jadwalFilterId = urlParams.get("jadwal") ? Number(urlParams.get("jadwal")) : null;
  const jadwalDari = urlParams.get("dari") ?? null;
  const jadwalKe = urlParams.get("ke") ?? null;
  const jadwalJam = urlParams.get("jam") ?? null;

  useEffect(() => {
    if (!token) {
      setLocation("/login");
    }
  }, [token, setLocation]);

  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    if (reloadTick === 0) {
      setOrders(null);
      setRawSchedBookings(null);
    }
    setError(null);
    void reloadTick;

    async function fetchJson(path: string): Promise<any[]> {
      const res = await fetch(`${apiBase}${path}`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      return res.json();
    }

    async function load() {
      if (!user) return;
      const isPenumpang = user.role === "penumpang";
      const schedPath = isPenumpang ? "/bookings/mine" : "/bookings/incoming";
      const carterPath = isPenumpang ? "/carter-bookings/mine" : "/carter-bookings/incoming";
      const [schedR, carterR] = await Promise.allSettled([fetchJson(schedPath), fetchJson(carterPath)]);
      if (cancelled) return;

      const unified: UnifiedOrder[] = [];
      const errs: string[] = [];

      if (schedR.status === "fulfilled") {
        setRawSchedBookings(schedR.value);
        for (const b of schedR.value) {
          unified.push({
            key: `s-${b.id}`,
            id: b.id,
            type: "schedule",
            origin_city: b.schedule?.origin_city ?? "-",
            destination_city: b.alighting_city || (b.schedule?.destination_city ?? "-"),
            travel_date: b.schedule?.departure_date ?? "",
            travel_time: b.schedule?.departure_time ?? "",
            total_amount: b.total_amount,
            status: b.status,
            created_at: b.created_at,
            counterpart_nama: isPenumpang ? b.driver?.nama ?? null : b.penumpang?.nama ?? null,
            detail_path: `/booking/${b.id}/etiket`,
            kursi_count: Array.isArray(b.kursi) ? b.kursi.length : undefined,
            trip_progress: b.schedule?.trip_progress ?? undefined,
            kendaraan_info: b.kendaraan ? `${b.kendaraan.merek} ${b.kendaraan.model} · ${b.kendaraan.plat_nomor}` : null,
          });
        }
      } else {
        errs.push(`Pesanan jadwal tetap gagal dimuat (${schedR.reason?.message ?? "error"}).`);
      }

      if (carterR.status === "fulfilled") {
        for (const b of carterR.value) {
          unified.push({
            key: `c-${b.id}`,
            id: b.id,
            type: "carter",
            origin_city: b.origin_city,
            destination_city: b.destination_city,
            travel_date: b.travel_date,
            travel_time: b.travel_time,
            total_amount: b.total_amount,
            status: b.status,
            created_at: b.created_at,
            counterpart_nama: isPenumpang ? b.driver?.nama ?? null : b.penumpang?.nama ?? null,
            counterpart_no_wa: isPenumpang ? null : b.penumpang?.no_whatsapp ?? null,
            detail_path: `/carter-booking/${b.id}/etiket`,
            pickup_lat: b.pickup_lat ?? null,
            pickup_lng: b.pickup_lng ?? null,
            pickup_label: b.pickup_label ?? null,
            carter_trip_progress: b.trip_progress ?? null,
            carter_pickup_confirmed: !!b.pickup_confirmed_at,
            kendaraan_info: b.kendaraan ? `${b.kendaraan.merek} ${b.kendaraan.model} · ${b.kendaraan.plat_nomor}` : null,
          });
        }
      } else {
        errs.push(`Pesanan sewa penuh gagal dimuat (${carterR.reason?.message ?? "error"}).`);
      }

      unified.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      setOrders(unified);
      setError(errs.length ? errs.join(" ") : null);
    }

    load();
    const intervalId = setInterval(() => {
      if (!cancelled) load();
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [token, user, reloadTick]);

  // Fetch passenger ratings for completed driver trips when viewing riwayat tab
  useEffect(() => {
    if (!token || user?.role !== "driver" || tab !== "riwayat" || !rawSchedBookings) return;
    const selesaiIds = new Set<number>();
    for (const b of rawSchedBookings) {
      const sid = b.schedule_id ?? b.schedule?.id;
      if (sid != null && b.schedule?.trip_progress === "selesai") selesaiIds.add(sid);
    }
    if (selesaiIds.size === 0) return;
    let cancelled = false;
    async function fetchRatings() {
      const next = new Map<number, any[]>();
      await Promise.allSettled(
        Array.from(selesaiIds).map(async (sid) => {
          const res = await fetch(`${apiBase}/schedules/${sid}/passenger-ratings`, {
            headers: { authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            next.set(sid, data);
          }
        }),
      );
      if (!cancelled) setScheduleRatings(new Map(next));
    }
    fetchRatings();
    return () => { cancelled = true; };
  }, [token, user, tab, rawSchedBookings]);

  const filtered = useMemo(() => {
    if (!orders) return null;
    const set = tab === "aktif" ? ACTIVE : ARCHIVED;
    return orders.filter((o) => {
      // Kalau jadwal/carter sudah selesai di sisi mitra, selalu masuk Riwayat
      // terlepas dari booking.status (untuk menangani data lama sebelum fix status sinkronisasi)
      if (o.trip_progress === "selesai" || o.carter_trip_progress === "selesai") {
        return tab === "riwayat";
      }
      return set.includes(o.status);
    });
  }, [orders, tab]);

  const isDriverView = user?.role === "driver";

  const driverScheduleGroups = useMemo<DriverGroupedTrip[] | null>(() => {
    if (!filtered || !isDriverView || !orders) return null;
    const sched = filtered.filter((o) => o.type === "schedule");
    const rawByBooking = new Map<number, any>();
    if (rawSchedBookings) {
      for (const b of rawSchedBookings) rawByBooking.set(b.id, b);
    }
    const groups = new Map<number, DriverGroupedTrip>();
    for (const o of sched) {
      const raw = rawByBooking.get(o.id);
      const sid = raw?.schedule_id ?? raw?.schedule?.id;
      if (sid == null) continue;
      let g = groups.get(sid);
      if (!g) {
        g = {
          key: `trip-${sid}`,
          schedule_id: sid,
          origin_city: o.origin_city,
          destination_city: o.destination_city,
          travel_date: o.travel_date,
          travel_time: o.travel_time,
          passengers: [],
          total_amount: 0,
          total_kursi: 0,
          latest_created_at: o.created_at,
          trip_progress: raw?.schedule?.trip_progress ?? "belum_jemput",
        };
        groups.set(sid, g);
      }
      const kursi: string[] = Array.isArray(raw?.kursi) ? raw.kursi : [];
      g.passengers.push({
        booking_id: o.id,
        nama: o.counterpart_nama ?? "—",
        kursi,
        status: o.status,
        total_amount: o.total_amount,
        no_whatsapp: raw?.penumpang?.no_whatsapp ?? null,
        pickup_lat: raw?.pickup_lat ?? null,
        pickup_lng: raw?.pickup_lng ?? null,
        pickup_label: raw?.pickup_label ?? null,
        dropoff_label: raw?.dropoff_label ?? null,
        alighting_city: raw?.alighting_city ?? null,
      });
      g.total_amount += o.total_amount;
      g.total_kursi += kursi.length;
      if (o.created_at > g.latest_created_at) g.latest_created_at = o.created_at;
    }
    let result = Array.from(groups.values()).sort((a, b) =>
      a.latest_created_at < b.latest_created_at ? 1 : -1,
    );
    // Filter by specific schedule jika ada jadwalFilterId
    if (jadwalFilterId != null) {
      result = result.filter((g) => g.schedule_id === jadwalFilterId);
    }
    return result;
  }, [filtered, isDriverView, orders, rawSchedBookings, jadwalFilterId]);

  const driverCarterList = useMemo(() => {
    if (!filtered || !isDriverView) return null;
    return filtered.filter((o) => o.type === "carter");
  }, [filtered, isDriverView]);

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
    if (!noWa) {
      setActionError("Nomor penumpang tidak tersedia.");
      return;
    }
    window.location.href = `tel:${noWa}`;
  }

  function openMap(p: DriverTripPassenger) {
    if (p.pickup_lat == null || p.pickup_lng == null) {
      setActionError("Titik jemput belum diisi penumpang.");
      return;
    }
    const url = `https://www.google.com/maps?q=${p.pickup_lat},${p.pickup_lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function advanceTripProgress(scheduleId: number) {
    if (!token) return;
    setBusyTrip(scheduleId);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/schedules/${scheduleId}/trip-progress`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setReloadTick((t) => t + 1);
    } catch (e: any) {
      setActionError(`Gagal memperbarui status trip: ${e.message ?? e}`);
    } finally {
      setBusyTrip(null);
    }
  }

  function tripButtonLabel(p: TripProgress): string | null {
    if (p === "belum_jemput") return "Mulai Jemput Konsumen";
    if (p === "sudah_jemput") return "Penumpang Sudah Naik Semua";
    if (p === "semua_naik") return "Berangkat ke Kota Tujuan";
    if (p === "dalam_perjalanan") return "Selesaikan Trip";
    if (p === "selesai") return null;
    return "Lanjutkan";
  }

  function tripStageLabel(p: TripProgress): string {
    if (p === "belum_jemput") return "Mulai Jemput Konsumen";
    if (p === "sudah_jemput") return "Menuju Penjemputan";
    if (p === "semua_naik") return "Berangkat ke Kota Tujuan";
    if (p === "dalam_perjalanan") return "Dalam perjalanan";
    if (p === "selesai") return "Selesai";
    return p;
  }

  function carterButtonLabel(tp: string | null | undefined): string | null {
    if (tp === "menunggu") return "Mulai Jemput Konsumen";
    if (tp === "menuju_jemput") return "Penumpang Sudah Naik";
    if (tp === "sudah_jemput") return "Berangkat ke Kota Tujuan";
    if (tp === "dalam_perjalanan") return "Selesaikan Trip";
    return null;
  }

  function carterStageLabel(status: Status, tp: string | null | undefined, pickupConfirmed?: boolean): string {
    if (status === "pending") return "Menunggu Pembayaran";
    if (status === "batal") return "Dibatalkan";
    if (status === "selesai" || tp === "selesai") return "Selesai";
    if (tp === "menuju_jemput" && pickupConfirmed) return "Sudah Jemput";
    if (tp === "menuju_jemput") return "Menuju Penjemputan";
    if (tp === "sudah_jemput") return "Berangkat ke Kota Tujuan";
    if (tp === "dalam_perjalanan") return "Dalam Perjalanan";
    return "Mulai Jemput Konsumen";
  }

  function carterStageCls(status: Status, tp: string | null | undefined, pickupConfirmed?: boolean): string {
    if (status === "pending") return "bg-yellow-100 text-yellow-800";
    if (status === "batal") return "bg-red-100 text-red-800";
    if (status === "selesai" || tp === "selesai") return "bg-green-100 text-green-800";
    if (tp === "menuju_jemput" && pickupConfirmed) return "bg-violet-100 text-violet-800";
    if (tp === "menuju_jemput") return "bg-blue-100 text-blue-800";
    if (tp === "sudah_jemput") return "bg-violet-100 text-violet-800";
    if (tp === "dalam_perjalanan") return "bg-indigo-100 text-indigo-800";
    return "bg-amber-100 text-amber-800";
  }

  async function openCarterChat(bookingId: number) {
    if (!token) return;
    setBusyCarterChat(bookingId);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/chat/threads`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ booking_type: "carter", booking_id: bookingId }),
      });
      const j = await res.json();
      if (!res.ok || !j?.id) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setLocation(`/chat/${j.id}`);
    } catch (e: any) {
      setActionError(`Gagal membuka chat: ${e.message ?? e}`);
    } finally {
      setBusyCarterChat(null);
    }
  }

  async function advanceCarterTripProgress(bookingId: number) {
    if (!token) return;
    setBusyCarterTrip(bookingId);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/carter-bookings/${bookingId}/trip-progress`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setReloadTick((t) => t + 1);
    } catch (e: any) {
      setActionError(`Gagal memperbarui status: ${e.message ?? e}`);
    } finally {
      setBusyCarterTrip(null);
    }
  }

  function openCarterMap(o: UnifiedOrder) {
    if (o.pickup_lat == null || o.pickup_lng == null) {
      setActionError("Titik jemput belum diisi penumpang.");
      return;
    }
    const url = `https://www.google.com/maps?q=${o.pickup_lat},${o.pickup_lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const isDriver = user?.role === "driver";
  const navItems = isDriver
    ? [
        { id: "dashboard", icon: LayoutGrid, label: "Dashboard", active: false, path: "/dashboard-driver" },
        { id: "jadwal", icon: CalendarDays, label: "Jadwal", active: false, path: "/jadwal" },
        { id: "chat", icon: MessageCircle, label: "Chat", active: false, path: "/chat" },
        { id: "pesanan", icon: ShoppingBag, label: "Pesanan", active: true, path: "/pesanan" },
        { id: "akun", icon: UserIcon, label: "Akun", active: false, path: "/profil" },
      ]
    : [
        { id: "beranda", icon: Home, label: "Beranda", active: false, path: "/dashboard-penumpang" },
        { id: "chat", icon: MessageCircle, label: "Chat", active: false, path: "/chat" },
        { id: "pesanan", icon: ShoppingBag, label: "Pesanan", active: true, path: "/pesanan" },
        { id: "akun", icon: UserIcon, label: "Akun", active: false, path: "/profil" },
      ];

  return (
    <div className="min-h-screen bg-[#f0ece4] flex flex-col max-w-md mx-auto pb-20">
      <div
        className="relative px-5 pt-10 pb-6"
        style={{
          background: isDriver
            ? "linear-gradient(135deg,#e8b86d 0%,#d4975a 35%,#c07840 65%,#a85e28 100%)"
            : "linear-gradient(135deg,#7dd3fc 0%,#38bdf8 35%,#0ea5e9 65%,#0369a1 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              jadwalFilterId
                ? setLocation("/jadwal")
                : setLocation(user?.role === "driver" ? "/dashboard-driver" : "/dashboard-penumpang")
            }
            data-testid="btn-back"
            aria-label="Kembali"
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <p className="text-xs font-semibold tracking-widest text-white/70 uppercase">
              {jadwalFilterId
                ? "Pesanan jadwal"
                : user?.role === "driver"
                ? "Pesanan masuk"
                : "Riwayat perjalananmu"}
            </p>
            <h1 className="text-3xl font-bold text-white mt-1 leading-none">
              {jadwalFilterId && jadwalDari && jadwalKe
                ? `${jadwalDari} → ${jadwalKe}`
                : "Pesanan"}
            </h1>
            {jadwalFilterId && jadwalJam && (
              <p className="text-xs text-white/80 mt-0.5">Keberangkatan pukul {jadwalJam}</p>
            )}
          </div>
        </div>

        {/* Curved bottom */}
        <div
          className="absolute -bottom-4 left-0 right-0 h-8 bg-[#f0ece4]"
          style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
        />
      </div>

      <div className="px-4 mt-2">
        <div className="bg-card rounded-full p-1 flex shadow-sm border border-border">
          <button
            onClick={() => setTab("aktif")}
            data-testid="tab-pesanan-aktif"
            className={`flex-1 py-2 rounded-full text-xs font-bold transition-all ${
              tab === "aktif" ? "bg-[#a85e28] text-white" : "text-muted-foreground"
            }`}
          >
            Aktif
          </button>
          <button
            onClick={() => setTab("riwayat")}
            data-testid="tab-pesanan-riwayat"
            className={`flex-1 py-2 rounded-full text-xs font-bold transition-all ${
              tab === "riwayat" ? "bg-[#a85e28] text-white" : "text-muted-foreground"
            }`}
          >
            Riwayat
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-3">
        {error && (
          <div className="bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2" data-testid="pesanan-error">
            {error}
          </div>
        )}

        {filtered === null && !error && (
          <div className="flex justify-center items-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        )}

        {filtered !== null && !error && (
          (() => {
            // Untuk driver dengan filter jadwal: cek driverScheduleGroups, bukan filtered langsung
            const isEmpty = isDriverView && jadwalFilterId != null
              ? (driverScheduleGroups ?? []).length === 0
              : filtered.length === 0;
            if (!isEmpty) return null;
            return (
              <div className="text-center py-16 text-muted-foreground" data-testid="pesanan-empty">
                <Inbox className="w-12 h-12 mx-auto mb-3 opacity-40" />
                {isDriverView && jadwalFilterId != null ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      Belum ada penumpang yang memesan
                    </p>
                    <p className="text-xs mt-1.5 leading-relaxed max-w-xs mx-auto">
                      Jadwal {jadwalDari} → {jadwalKe} pukul {jadwalJam} belum ada pemesanan.
                    </p>
                  </>
                ) : (
                  <p className="text-sm">
                    {tab === "aktif" ? "Belum ada pesanan aktif." : "Belum ada riwayat pesanan."}
                  </p>
                )}
              </div>
            );
          })()
        )}

        {actionError && (
          <div
            className="bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2"
            data-testid="pesanan-action-error"
          >
            {actionError}
          </div>
        )}

        {isDriverView &&
          driverScheduleGroups?.map((g) => {
            const hasPaidPassengers = g.trip_progress === "belum_jemput" && g.passengers.some((p) => p.status === "paid");
            const btnLabel = tripButtonLabel(g.trip_progress);
            const stage = tripStageLabel(g.trip_progress);
            return (
              <div
                key={g.key}
                data-testid={`trip-${g.schedule_id}`}
                onClick={() => setLocation(`/trip/${g.schedule_id}/detail`)}
                className="bg-card rounded-2xl p-4 border border-border shadow-sm cursor-pointer hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    Jadwal Tetap
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      g.trip_progress === "sudah_jemput"
                        ? "bg-blue-100 text-blue-800"
                        : g.trip_progress === "dalam_perjalanan"
                        ? "bg-indigo-100 text-indigo-800"
                        : g.trip_progress === "selesai"
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                    data-testid={`trip-${g.schedule_id}-stage`}
                  >
                    {stage}
                  </span>
                </div>

                <div className="flex items-start gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-foreground leading-snug">
                    {g.origin_city}{" "}
                    <span className="text-muted-foreground font-normal">→</span>{" "}
                    {g.destination_city}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3 ml-6">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(g.travel_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock4 className="w-3 h-3" /> {g.travel_time}
                  </span>
                  <span className="text-muted-foreground/70">·</span>
                  <span>
                    {g.passengers.length} penumpang · {g.total_kursi} kursi
                  </span>
                </div>

                <div className="border-t border-border/50 pt-2 space-y-2">
                  <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                    Daftar Penumpang
                  </p>
                  {g.passengers.map((p, idx) => (
                    <div
                      key={p.booking_id}
                      data-testid={`trip-${g.schedule_id}-pax-${p.booking_id}`}
                      className="flex items-center justify-between gap-2 py-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground font-mono w-5 flex-shrink-0">
                            {idx + 1}.
                          </span>
                          <p className="text-sm font-semibold text-foreground truncate">
                            {p.nama}
                          </p>
                          {p.status === "paid" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 flex-shrink-0 whitespace-nowrap">
                              Menunggu konfirmasi admin
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-7 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            Kursi {p.kursi.length ? p.kursi.join(", ") : "—"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[11px] font-semibold text-foreground">
                            {formatRupiah(p.total_amount)}
                          </span>
                        </div>
                        {p.alighting_city && (
                          <div className="ml-7 mt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Turun di {p.alighting_city}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openChat(p.booking_id); }}
                          disabled={busyChat === p.booking_id}
                          aria-label="Chat penumpang"
                          data-testid={`pax-${p.booking_id}-chat`}
                          className="w-9 h-9 rounded-full bg-amber-50 hover:bg-amber-100 flex items-center justify-center disabled:opacity-50 transition-colors"
                        >
                          {busyChat === p.booking_id ? (
                            <Loader2 className="w-4 h-4 text-amber-700 animate-spin" />
                          ) : (
                            <MessageCircle className="w-4 h-4 text-amber-700" />
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openPhone(p.no_whatsapp); }}
                          aria-label="Telepon penumpang"
                          data-testid={`pax-${p.booking_id}-phone`}
                          className="w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center transition-colors"
                        >
                          <Phone className="w-4 h-4 text-emerald-700" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openMap(p); }}
                          aria-label="Lokasi jemput"
                          data-testid={`pax-${p.booking_id}-map`}
                          disabled={p.status === "paid"}
                          title={p.status === "paid" ? "Lokasi tersedia setelah pembayaran dikonfirmasi admin" : "Buka lokasi jemput"}
                          className="w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <MapIcon className="w-4 h-4 text-blue-700" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                  <p className="text-[11px] text-muted-foreground">Total trip</p>
                  <p className="text-sm font-bold text-foreground">
                    {formatRupiah(g.total_amount)}
                  </p>
                </div>

                {/* Rating penumpang — tampil di riwayat (selesai) */}
                {g.trip_progress === "selesai" && scheduleRatings.has(g.schedule_id) && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                      Rating dari Penumpang
                    </p>
                    {(scheduleRatings.get(g.schedule_id) ?? []).map((pr) => (
                      <div key={pr.booking_id} className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-foreground truncate">
                            {pr.penumpang_nama}
                            <span className="font-normal text-muted-foreground ml-1">
                              · Kursi {pr.kursi.length ? pr.kursi.join(", ") : "—"}
                            </span>
                          </p>
                          {pr.rating ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <div className="flex gap-0.5">
                                {[1,2,3,4,5].map((s) => (
                                  <Star
                                    key={s}
                                    className={`w-3.5 h-3.5 ${s <= pr.rating!.stars ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40"}`}
                                  />
                                ))}
                              </div>
                              {pr.rating.comment && (
                                <span className="text-[10px] text-muted-foreground italic truncate max-w-[160px]">
                                  "{pr.rating.comment}"
                                </span>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5 italic">Belum memberi rating</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {hasPaidPassengers && (
                  <div className="flex items-start gap-2 mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <span className="text-amber-500 flex-shrink-0 text-sm leading-none mt-0.5">⚠</span>
                    <p className="text-[11px] text-amber-800 leading-snug">
                      Ada penumpang yang belum dikonfirmasi pembayarannya oleh admin. Tombol "Mulai Jemput" akan aktif setelah semua pembayaran dikonfirmasi.
                    </p>
                  </div>
                )}
                {btnLabel ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); advanceTripProgress(g.schedule_id); }}
                    disabled={busyTrip === g.schedule_id || hasPaidPassengers}
                    data-testid={`trip-${g.schedule_id}-action`}
                    className="w-full mt-3 py-3 rounded-xl bg-[#a85e28] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#92501f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {busyTrip === g.schedule_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {btnLabel}
                  </button>
                ) : (
                  <div
                    className="w-full mt-3 py-3 rounded-xl bg-green-50 text-green-700 font-bold text-sm flex items-center justify-center gap-2"
                    data-testid={`trip-${g.schedule_id}-done`}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Trip selesai
                  </div>
                )}
              </div>
            );
          })}

        {isDriverView &&
          driverCarterList?.map((o) => {
            const tp = o.carter_trip_progress;
            const stageLabel = carterStageLabel(o.status, tp, o.carter_pickup_confirmed);
            const stageCls = carterStageCls(o.status, tp, o.carter_pickup_confirmed);
            const btnLabel = ["paid", "aktif", "confirmed"].includes(o.status) ? carterButtonLabel(tp) : null;
            const isDone = o.status === "selesai" || tp === "selesai";
            const carterBlockedByPayment = o.status === "paid" && (!tp || tp === "menunggu");
            return (
              <div
                key={o.key}
                data-testid={`pesanan-${o.type}-${o.id}`}
                onClick={() => setLocation(`/carter-booking/${o.id}/driver-detail`)}
                className="bg-card rounded-2xl p-4 border border-border shadow-sm cursor-pointer hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                    Carter
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${stageCls}`}>
                    {stageLabel}
                  </span>
                </div>

                <div className="flex items-start gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-foreground leading-snug">
                    {o.origin_city} <span className="text-muted-foreground font-normal">→</span> {o.destination_city}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3 ml-6">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(o.travel_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock4 className="w-3 h-3" /> {o.travel_time}
                  </span>
                </div>

                {o.counterpart_nama && (
                  <div className="border-t border-border/50 pt-2">
                    <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground mb-1.5">
                      Penumpang
                    </p>
                    <div className="flex items-center justify-between gap-2 py-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{o.counterpart_nama}</p>
                        <p className="text-[11px] font-semibold text-foreground mt-0.5">{formatRupiah(o.total_amount)}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openCarterChat(o.id); }}
                          disabled={busyCarterChat === o.id}
                          aria-label="Chat penumpang"
                          data-testid={`carter-${o.id}-chat`}
                          className="w-9 h-9 rounded-full bg-amber-50 hover:bg-amber-100 flex items-center justify-center disabled:opacity-50 transition-colors"
                        >
                          {busyCarterChat === o.id ? (
                            <Loader2 className="w-4 h-4 text-amber-700 animate-spin" />
                          ) : (
                            <MessageCircle className="w-4 h-4 text-amber-700" />
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openPhone(o.counterpart_no_wa ?? null); }}
                          aria-label="Telepon penumpang"
                          data-testid={`carter-${o.id}-phone`}
                          className="w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center transition-colors"
                        >
                          <Phone className="w-4 h-4 text-emerald-700" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openCarterMap(o); }}
                          aria-label="Lokasi jemput"
                          data-testid={`carter-${o.id}-map`}
                          disabled={carterBlockedByPayment}
                          title={carterBlockedByPayment ? "Lokasi tersedia setelah pembayaran dikonfirmasi admin" : "Buka lokasi jemput"}
                          className="w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <MapIcon className="w-4 h-4 text-blue-700" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {carterBlockedByPayment && (
                  <div className="flex items-start gap-2 mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <span className="text-amber-500 flex-shrink-0 text-sm leading-none mt-0.5">⚠</span>
                    <p className="text-[11px] text-amber-800 leading-snug">
                      Pembayaran penumpang belum dikonfirmasi admin. Tombol "Mulai Jemput" akan aktif setelah pembayaran dikonfirmasi.
                    </p>
                  </div>
                )}
                {btnLabel ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); advanceCarterTripProgress(o.id); }}
                    disabled={busyCarterTrip === o.id || carterBlockedByPayment}
                    data-testid={`carter-${o.id}-action`}
                    className="w-full mt-3 py-3 rounded-xl bg-[#a85e28] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#92501f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {busyCarterTrip === o.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {btnLabel}
                  </button>
                ) : isDone ? (
                  <div
                    className="w-full mt-3 py-3 rounded-xl bg-green-50 text-green-700 font-bold text-sm flex items-center justify-center gap-2"
                    data-testid={`carter-${o.id}-done`}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Perjalanan selesai
                  </div>
                ) : !o.counterpart_nama ? (
                  <button
                    onClick={() => setLocation(o.detail_path)}
                    className="w-full mt-3 py-2.5 rounded-xl border border-border text-sm text-muted-foreground flex items-center justify-center gap-1 hover:bg-muted/30 transition-colors"
                  >
                    Lihat Detail <ChevronRight className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            );
          })}

        {!isDriverView &&
          filtered?.map((o) => {
            const sb = o.type === "schedule" ? penumpangStatusBadge(o) : carterPenumpangBadge(o.status, o.carter_trip_progress, o.carter_pickup_confirmed);
            return (
              <button
                key={o.key}
                data-testid={`pesanan-${o.type}-${o.id}`}
                onClick={() => setLocation(o.detail_path)}
                className="w-full text-left bg-card rounded-2xl p-4 border border-border shadow-sm hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      o.type === "schedule" ? "bg-amber-100 text-amber-800" : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {o.type === "schedule" ? "Jadwal Tetap" : "Carter"}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${sb.cls}`}>
                    {sb.label}
                  </span>
                </div>

                <div className="flex items-start gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-foreground leading-snug">
                    {o.origin_city} <span className="text-muted-foreground font-normal">→</span> {o.destination_city}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2 ml-6">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(o.travel_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock4 className="w-3 h-3" /> {o.travel_time}
                  </span>
                </div>

                <div className="flex items-end justify-between mt-3 pt-3 border-t border-border/50">
                  <div className="min-w-0 space-y-0.5">
                    {o.counterpart_nama && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        Mitra: <span className="font-semibold text-foreground">{o.counterpart_nama}</span>
                      </p>
                    )}
                    {o.kendaraan_info && (
                      <p className="text-[11px] text-muted-foreground truncate">{o.kendaraan_info}</p>
                    )}
                    {o.type === "schedule" && o.kursi_count != null && (
                      <p className="text-[11px] text-muted-foreground">{o.kursi_count} kursi</p>
                    )}
                  </div>
                  {o.status === "confirmed" ? (
                    <div className="flex items-center gap-1 text-amber-700 font-semibold text-xs">
                      <Ticket className="w-3.5 h-3.5" />
                      Lihat E-Tiket
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-bold text-foreground">{formatRupiah(o.total_amount)}</p>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
      </div>

      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border"
        style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center justify-around px-2 py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setLocation(item.path)}
                data-testid={`nav-${item.id}`}
                className="flex flex-col items-center gap-1 px-3 py-1"
              >
                <Icon
                  className="w-5 h-5"
                  style={{ color: item.active ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))" }}
                />
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: item.active ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))" }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
