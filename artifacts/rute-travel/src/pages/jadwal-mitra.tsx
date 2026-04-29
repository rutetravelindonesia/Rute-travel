import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  Plus,
  MapPin,
  Users,
  Home,
  MessageCircle,
  ShoppingBag,
  User,
  ChevronRight,
  Lock,
  Car,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import OfflineSeatPicker from "@/components/offline-seat-picker";

interface CarterSettings {
  id: number;
  is_active: boolean;
  dates: string[];
  routes: { destination_city: string; price: number }[];
  harga_per_km: number | null;
}

interface Schedule {
  id: number;
  driver_id: number;
  origin_city: string;
  destination_city: string;
  departure_date: string;
  departure_time: string;
  capacity: number;
  price_per_seat: number;
  trip_progress: string;
  kursi_offline: string[];
  kursi_booked: string[];
  kursi_terisi: number;
  kursi_tersisa: number;
}

interface Tebengan {
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
}

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const HARI_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTanggalPanjang(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${HARI_SHORT[d.getDay()]}, ${d.getDate()} ${BULAN_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function tripProgressLabel(p: string): { label: string; cls: string } {
  switch (p) {
    case "sudah_jemput":
      return { label: "Sudah jemput", cls: "bg-blue-100 text-blue-800" };
    case "dalam_perjalanan":
      return { label: "Dalam perjalanan", cls: "bg-indigo-100 text-indigo-800" };
    case "selesai":
      return { label: "Selesai", cls: "bg-green-100 text-green-800" };
    default:
      return { label: "Belum berangkat", cls: "bg-amber-100 text-amber-800" };
  }
}

function formatRupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function JadwalMitraPage() {
  const [, setLocation] = useLocation();
  const { token, user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [tebenganList, setTebenganList] = useState<Tebengan[]>([]);
  const [carterSettings, setCarterSettings] = useState<CarterSettings | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const today = ymd(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [offlineModal, setOfflineModal] = useState<Schedule | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmBatal, setConfirmBatal] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [batalError, setBatalError] = useState<string | null>(null);
  const [confirmBatalCarter, setConfirmBatalCarter] = useState(false);
  const [deletingCarter, setDeletingCarter] = useState(false);
  const [batalCarterError, setBatalCarterError] = useState<string | null>(null);

  async function handleBatalkanJadwal(id: number) {
    setDeleting(true);
    setBatalError(null);
    try {
      const res = await fetch(`${apiBase}/schedules/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal membatalkan jadwal.");
      }
      setConfirmBatal(null);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setBatalError(e?.message ?? "Terjadi kesalahan.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleBatalkanCarter(date: string) {
    setDeletingCarter(true);
    setBatalCarterError(null);
    try {
      const res = await fetch(`${apiBase}/carter/settings/date/${date}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal membatalkan Carter.");
      }
      setConfirmBatalCarter(false);
      // Hapus tanggal dari state lokal tanpa reload penuh
      setCarterSettings((prev) => prev ? { ...prev, dates: prev.dates.filter((d) => d !== date) } : prev);
    } catch (e: any) {
      setBatalCarterError(e?.message ?? "Terjadi kesalahan.");
    } finally {
      setDeletingCarter(false);
    }
  }

  // 30-day strip starting yesterday so user can also peek at recent past
  const dateStrip = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    const arr: { iso: string; day: number; weekday: string; month: string; isToday: boolean }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = ymd(d);
      arr.push({
        iso,
        day: d.getDate(),
        weekday: HARI_SHORT[d.getDay()],
        month: BULAN_SHORT[d.getMonth()],
        isToday: iso === today,
      });
    }
    return arr;
  }, [today]);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    if (user && user.role !== "driver") {
      setLocation("/dashboard-penumpang");
    }
  }, [token, user, setLocation]);

  useEffect(() => {
    if (!token || user?.role !== "driver") return;
    let cancelled = false;
    setError(null);
    async function load() {
      try {
        const [schedRes, carterRes, tebenganRes] = await Promise.all([
          fetch(`${apiBase}/schedules/mine`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiBase}/carter/settings/mine`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiBase}/tebengan/mine`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!schedRes.ok) {
          let msg = `HTTP ${schedRes.status}`;
          try { const j = await schedRes.json(); if (j?.error) msg = j.error; } catch {}
          throw new Error(msg);
        }
        const [schedData, carterData, tebenganData]: [Schedule[], CarterSettings | null, Tebengan[]] = await Promise.all([
          schedRes.json(),
          carterRes.ok ? carterRes.json() : Promise.resolve(null),
          tebenganRes.ok ? tebenganRes.json() : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setSchedules(schedData);
          setCarterSettings(carterData);
          setTebenganList(Array.isArray(tebenganData) ? tebenganData : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Gagal memuat jadwal.");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token, user?.role, reloadKey]);

  // Auto-scroll the date strip so the selected (or today) date is visible.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLButtonElement>(
      `[data-date="${selectedDate}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDate]);

  // Reset konfirmasi batal Carter saat pindah tanggal
  useEffect(() => {
    setConfirmBatalCarter(false);
    setBatalCarterError(null);
  }, [selectedDate]);

  // Highlight which dates have schedules or tebengan.
  const datesWithSchedule = useMemo(() => {
    const set = new Set<string>();
    if (schedules) for (const s of schedules) {
      if (s.trip_progress !== "selesai") set.add(s.departure_date);
    }
    for (const t of tebenganList) if (t.status !== "batal") set.add(t.departure_date);
    return set;
  }, [schedules, tebenganList]);

  // Carter available dates.
  const datesWithCarter = useMemo(() => {
    if (!carterSettings?.is_active) return new Set<string>();
    return new Set<string>(carterSettings.dates ?? []);
  }, [carterSettings]);

  const filtered = useMemo(() => {
    if (!schedules) return null;
    return schedules
      .filter((s) => s.departure_date === selectedDate && s.trip_progress !== "selesai")
      .sort((a, b) => a.departure_time.localeCompare(b.departure_time));
  }, [schedules, selectedDate]);

  const filteredTebengan = useMemo(() => {
    return tebenganList
      .filter((t) => t.departure_date === selectedDate && t.status !== "batal")
      .sort((a, b) => a.departure_time.localeCompare(b.departure_time));
  }, [tebenganList, selectedDate]);

  return (
    <div className="min-h-screen bg-[#f0ece4] flex flex-col max-w-md mx-auto relative">
      {/* HEADER */}
      <div
        className="relative px-5 pt-10 pb-6"
        style={{
          background:
            "linear-gradient(135deg, #e8b86d 0%, #d4975a 35%, #c07840 65%, #a85e28 100%)",
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <button
            data-testid="btn-back"
            onClick={() => setLocation("/dashboard-driver")}
            className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <p className="text-xs font-semibold tracking-widest text-white/70 uppercase">
            Jadwal Mitra
          </p>
        </div>
        <h1 className="text-3xl font-bold text-white leading-tight">Jadwal Saya</h1>
        <p className="text-sm text-white/80 mt-1">
          Pilih tanggal untuk melihat jadwal yang sudah kamu buat.
        </p>

        {/* Curved bottom */}
        <div
          className="absolute -bottom-4 left-0 right-0 h-8 bg-[#f0ece4]"
          style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
        />
      </div>

      {/* DATE STRIP */}
      <div
        ref={stripRef}
        className="flex gap-2 px-5 pt-4 pb-3 overflow-x-auto scrollbar-hide"
        data-testid="date-strip"
        style={{ scrollbarWidth: "none" }}
      >
        {dateStrip.map((d) => {
          const isSelected = d.iso === selectedDate;
          const hasSchedule = datesWithSchedule.has(d.iso);
          return (
            <button
              key={d.iso}
              data-date={d.iso}
              data-testid={`date-${d.iso}`}
              onClick={() => setSelectedDate(d.iso)}
              className={`flex-shrink-0 w-14 py-2.5 rounded-2xl border-2 flex flex-col items-center gap-0.5 transition-all ${
                isSelected
                  ? "bg-[#a85e28] border-[#a85e28] text-white shadow-md"
                  : "bg-card border-border text-foreground hover:bg-muted/40"
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isSelected ? "text-white/80" : "text-muted-foreground"
                }`}
              >
                {d.weekday}
              </span>
              <span className="text-lg font-bold tabular-nums leading-none">{d.day}</span>
              <span
                className={`text-[10px] ${
                  isSelected ? "text-white/80" : "text-muted-foreground"
                }`}
              >
                {d.month}
              </span>
              <div className="flex gap-0.5 mt-0.5 justify-center">
                <span className={`w-1.5 h-1.5 rounded-full ${hasSchedule ? isSelected ? "bg-white" : "bg-[#a85e28]" : "bg-transparent"}`} />
                <span className={`w-1.5 h-1.5 rounded-full ${datesWithCarter.has(d.iso) ? isSelected ? "bg-white" : "bg-green-500" : "bg-transparent"}`} />
              </div>
            </button>
          );
        })}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto pb-28 px-5">
        <div className="flex items-center justify-between mb-3 mt-2">
          <h2 className="text-sm font-bold text-foreground" data-testid="selected-date">
            <CalendarDays className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            {formatTanggalPanjang(selectedDate)}
          </h2>
          <span className="text-xs text-muted-foreground" data-testid="schedule-count">
            {filtered
              ? `${filtered.length + filteredTebengan.length + (datesWithCarter.has(selectedDate) ? 1 : 0)} jadwal`
              : "—"}
          </span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-3 py-2 mb-3">
            {error}
          </div>
        )}

        {/* CARTER AVAILABILITY CARD */}
        {datesWithCarter.has(selectedDate) && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                <Car className="w-5 h-5 text-green-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-green-200 text-green-800 uppercase">Carter Tersedia</span>
                </div>
                <p className="text-sm font-bold text-foreground">Kamu siap menerima Carter</p>
                {carterSettings?.routes && carterSettings.routes.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    Rute: {carterSettings.routes.map((r) => `${carterSettings.origin_city} → ${r.destination_city}`).join(", ")}
                  </p>
                )}
              </div>
              <button
                onClick={() => setLocation("/carter/atur")}
                className="text-[11px] font-semibold text-green-700 flex-shrink-0"
              >
                Atur <ChevronRight className="w-3 h-3 inline -mt-0.5" />
              </button>
            </div>
            {/* Tombol batalkan carter untuk tanggal ini */}
            {!confirmBatalCarter ? (
              <button
                onClick={() => { setConfirmBatalCarter(true); setBatalCarterError(null); }}
                className="mt-3 w-full text-[11px] font-semibold text-red-500 border border-red-200 rounded-xl py-1.5 bg-white hover:bg-red-50 transition-colors"
              >
                Batalkan Carter Hari Ini
              </button>
            ) : (
              <div className="mt-3 bg-white border border-red-200 rounded-xl p-3 space-y-2">
                <p className="text-[11px] text-red-700 font-semibold">Yakin ingin membatalkan Carter pada tanggal ini?</p>
                {batalCarterError && <p className="text-[11px] text-red-600">{batalCarterError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleBatalkanCarter(selectedDate)}
                    disabled={deletingCarter}
                    className="flex-1 text-[11px] font-bold text-white bg-red-500 rounded-lg py-1.5 disabled:opacity-50"
                  >
                    {deletingCarter ? "Membatalkan..." : "Ya, Batalkan"}
                  </button>
                  <button
                    onClick={() => { setConfirmBatalCarter(false); setBatalCarterError(null); }}
                    disabled={deletingCarter}
                    className="flex-1 text-[11px] font-semibold text-foreground border border-border rounded-lg py-1.5"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!schedules ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
          </div>
        ) : filtered && filtered.length === 0 && filteredTebengan.length === 0 && !datesWithCarter.has(selectedDate) ? (
          <div
            className="bg-card rounded-2xl border border-dashed border-border p-6 text-center"
            data-testid="empty-state"
          >
            <CalendarDays className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">
              Tidak ada jadwal pada tanggal ini
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Buka jadwal baru supaya penumpang bisa pesan untuk hari ini.
            </p>
            <button
              data-testid="btn-buat-jadwal-empty"
              onClick={() => setLocation("/jadwal-tetap/buat")}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#a85e28] text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Buat Jadwal
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered?.map((s) => {
              const tp = tripProgressLabel(s.trip_progress);
              const offlineCount = (s.kursi_offline ?? []).length;
              const bookedCount = (s.kursi_booked ?? []).length;
              const totalTerisi = offlineCount + bookedCount;
              const sisa = s.capacity - totalTerisi;
              return (
                <div
                  key={s.id}
                  data-testid={`mitra-schedule-${s.id}`}
                  className="bg-card rounded-2xl border border-border p-4"
                >
                  <div className="flex items-start gap-3 mb-2">
                    <div className="bg-amber-50 rounded-xl px-3 py-2 flex-shrink-0 text-center min-w-[64px]">
                      <p className="text-[8px] font-bold tracking-wider text-amber-700 uppercase leading-none mb-0.5">
                        Komitmen
                      </p>
                      <p className="text-sm font-bold text-foreground tabular-nums leading-none">
                        {s.departure_time}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">
                          Jadwal Tetap
                        </span>
                        <span
                          className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded uppercase ${tp.cls}`}
                        >
                          {tp.label}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-foreground leading-snug flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-700" />
                        {s.origin_city}{" "}
                        <span className="text-muted-foreground font-normal">→</span>{" "}
                        {s.destination_city}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {sisa}/{s.capacity} sisa
                      </span>
                      {offlineCount > 0 && (
                        <span className="flex items-center gap-1 text-green-700">
                          <Lock className="w-3 h-3" /> {offlineCount} offline
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatRupiah(s.price_per_seat)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      data-testid={`btn-offline-${s.id}`}
                      onClick={() => setOfflineModal(s)}
                      disabled={s.trip_progress === "selesai"}
                      className="py-2.5 rounded-xl border border-dashed border-border text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 bg-muted/30 disabled:opacity-50"
                    >
                      <Lock className="w-3.5 h-3.5 text-green-700" />
                      {offlineCount > 0
                        ? `${offlineCount} penumpang offline · Ubah`
                        : "Catat Penumpang Offline"}
                    </button>
                    <button
                      data-testid={`btn-pesanan-${s.id}`}
                      onClick={() => setLocation(`/pesanan?jadwal=${s.id}&dari=${encodeURIComponent(s.origin_city)}&ke=${encodeURIComponent(s.destination_city)}&jam=${encodeURIComponent(s.departure_time)}`)}
                      className="py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5"
                      style={{ backgroundColor: "hsl(var(--accent))" }}
                    >
                      Lihat Pesanan
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Batalkan Jadwal — hanya jika belum ada penumpang yang pesan */}
                  {bookedCount === 0 && s.trip_progress === "belum_jemput" && (
                    <div className="mt-2">
                      {confirmBatal === s.id ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                          <p className="text-xs font-semibold text-red-700 mb-2 text-center">
                            Yakin ingin membatalkan jadwal ini?
                          </p>
                          {batalError && (
                            <p className="text-[11px] text-red-600 mb-2 text-center">{batalError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setConfirmBatal(null); setBatalError(null); }}
                              disabled={deleting}
                              className="flex-1 py-2 rounded-lg border border-border text-xs font-semibold text-foreground bg-white disabled:opacity-50"
                            >
                              Tidak
                            </button>
                            <button
                              data-testid={`btn-batal-konfirm-${s.id}`}
                              onClick={() => handleBatalkanJadwal(s.id)}
                              disabled={deleting}
                              className="flex-1 py-2 rounded-lg bg-red-600 text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1"
                            >
                              {deleting ? (
                                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              Ya, Batalkan
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          data-testid={`btn-batalkan-${s.id}`}
                          onClick={() => { setConfirmBatal(s.id); setBatalError(null); }}
                          className="w-full py-2 rounded-xl border border-red-200 text-xs font-semibold text-red-600 flex items-center justify-center gap-1.5 bg-red-50/60 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Batalkan Jadwal
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredTebengan.map((t) => {
              const statusCls: Record<string, string> = {
                aktif: "bg-green-100 text-green-800",
                berangkat: "bg-blue-100 text-blue-800",
                selesai: "bg-muted text-muted-foreground",
              };
              const statusLabel: Record<string, string> = {
                aktif: "Aktif",
                berangkat: "Berangkat",
                selesai: "Selesai",
              };
              return (
                <div
                  key={`tebengan-${t.id}`}
                  data-testid={`mitra-tebengan-${t.id}`}
                  className="bg-card rounded-2xl border border-border p-4"
                  onClick={() => setLocation(`/tebengan/${t.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="flex items-start gap-3 mb-2">
                    <div className="bg-green-50 rounded-xl px-3 py-2 flex-shrink-0 text-center min-w-[64px]">
                      <p className="text-[8px] font-bold tracking-wider text-green-700 uppercase leading-none mb-0.5">
                        Perkiraan
                      </p>
                      <p className="text-sm font-bold text-foreground tabular-nums leading-none">
                        ~{t.departure_time}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-green-100 text-green-800 uppercase">
                          Tebengan Pulang
                        </span>
                        <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded uppercase ${statusCls[t.status] ?? "bg-muted text-muted-foreground"}`}>
                          {statusLabel[t.status] ?? t.status}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-foreground leading-snug flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-green-700" />
                        {t.origin_city}{" "}
                        <span className="text-muted-foreground font-normal">→</span>{" "}
                        {t.destination_city}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {t.kursi_terisi}/{t.max_kursi} terisi · {t.kursi_tersisa} sisa
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatRupiah(t.price_per_seat)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB BUAT JADWAL */}
      <button
        data-testid="btn-buat-jadwal-fab"
        onClick={() => setLocation("/jadwal-tetap/buat")}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-[#a85e28] text-white shadow-xl flex items-center justify-center"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* BOTTOM NAV */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border"
        style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center justify-around px-2 py-3">
          {[
            { id: "dashboard", icon: Home, label: "Dashboard", active: false, path: "/dashboard-driver" },
            { id: "jadwal", icon: CalendarDays, label: "Jadwal", active: true, path: "/jadwal" },
            { id: "chat", icon: MessageCircle, label: "Chat", active: false, path: "/chat" },
            { id: "pesanan", icon: ShoppingBag, label: "Pesanan", active: false, path: "/pesanan" },
            { id: "akun", icon: User, label: "Akun", active: false, path: "/profil" },
          ].map((nav) => {
            const Icon = nav.icon;
            return (
              <button
                key={nav.id}
                data-testid={`nav-${nav.id}`}
                onClick={() => setLocation(nav.path)}
                className="flex flex-col items-center gap-1 px-3 py-1"
              >
                <Icon
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
            );
          })}
        </div>
      </div>

      {offlineModal && (
        <OfflineSeatPicker
          open={true}
          scheduleId={offlineModal.id}
          capacity={offlineModal.capacity}
          initialOffline={offlineModal.kursi_offline ?? []}
          bookedSeats={offlineModal.kursi_booked ?? []}
          apiBase={apiBase}
          token={token}
          onClose={() => setOfflineModal(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
