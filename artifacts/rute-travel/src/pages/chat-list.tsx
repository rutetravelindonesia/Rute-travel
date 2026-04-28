import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MessageCircle, Loader2 } from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { useAuth } from "@/contexts/auth";
import { BottomNav } from "@/components/bottom-nav";
import { resolvePhotoUrl } from "@/lib/photoUrl";

interface ThreadItem {
  id: number;
  booking_type: "schedule" | "carter";
  booking_id: number;
  booking_status: string;
  origin_city: string;
  destination_city: string;
  travel_date: string;
  travel_time: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  counterpart: { id: number; nama: string; role: string; foto_profil: string | null } | null;
}

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "baru saja";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}j`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export default function ChatListPage() {
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"aktif" | "riwayat">("aktif");
  const [threads, setThreads] = useState<ThreadItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
  }, [token, setLocation]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setThreads(null);
    setError(null);
    (async () => {
      try {
        const r = await fetch(`${apiBase}/chat/threads/mine?status=${tab}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error ?? "Gagal memuat chat.");
          setThreads([]);
          return;
        }
        setThreads(data);
      } catch (e) {
        if (!cancelled) {
          setError("Tidak bisa terhubung ke server.");
          setThreads([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tab]);

  const backTarget = user?.role === "driver" ? "/dashboard-driver" : "/dashboard-penumpang";

  return (
    <div className="min-h-screen bg-[#f0ece4] flex flex-col max-w-md mx-auto">
      <div
        className="relative px-5 pt-10 pb-5"
        style={{
          background:
            user?.role === "driver"
              ? "linear-gradient(135deg,#e8b86d 0%,#d4975a 35%,#c07840 65%,#a85e28 100%)"
              : "linear-gradient(135deg,#7dd3fc 0%,#38bdf8 35%,#0ea5e9 65%,#0369a1 100%)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setLocation(backTarget)}
            className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
            data-testid="btn-chat-back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-white text-lg font-bold">Chat</h1>
        </div>
        <div className="flex bg-white/15 rounded-xl p-1">
          <button
            onClick={() => setTab("aktif")}
            data-testid="tab-aktif"
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
              tab === "aktif" ? "bg-white text-[#a85e28]" : "text-white"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setTab("riwayat")}
            data-testid="tab-riwayat"
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
              tab === "riwayat" ? "bg-white text-[#a85e28]" : "text-white"
            }`}
          >
            Riwayat Chat
          </button>
        </div>

        {/* Curved bottom */}
        <div
          className="absolute -bottom-4 left-0 right-0 h-8 bg-[#f0ece4]"
          style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
        />
      </div>

      <div className="flex-1 px-4 py-4 pb-24 space-y-2">
        {threads === null && (
          <div className="flex justify-center items-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        )}
        {threads !== null && error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3" data-testid="chat-list-error">
            {error}
          </div>
        )}
        {threads !== null && !error && threads.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">
              {tab === "aktif" ? "Belum ada chat aktif." : "Belum ada riwayat chat."}
            </p>
            <p className="text-xs mt-1">
              {tab === "aktif"
                ? "Chat akan muncul setelah ada orderan aktif."
                : "Chat dari orderan yang sudah selesai akan tampil di sini."}
            </p>
          </div>
        )}
        {threads?.map((t) => {
          const tFoto = resolvePhotoUrl(t.counterpart?.foto_profil, apiBase);
          return (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => setLocation(`/chat/${t.id}`)}
            onKeyDown={(e) => e.key === "Enter" && setLocation(`/chat/${t.id}`)}
            data-testid={`thread-${t.id}`}
            className="w-full text-left bg-card rounded-xl p-3 border border-border hover:bg-muted/40 transition cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={(e) => {
                  if (!tFoto) return;
                  e.stopPropagation();
                  setPhotoModal({ url: tFoto, name: t.counterpart?.nama ?? "" });
                }}
                className={`w-11 h-11 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm flex-shrink-0 overflow-hidden ${tFoto ? "cursor-zoom-in" : "cursor-default"}`}
                aria-label={tFoto ? `Lihat foto ${t.counterpart?.nama}` : undefined}
              >
                {tFoto ? (
                  <img
                    src={tFoto}
                    alt={t.counterpart?.nama}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  t.counterpart?.nama?.[0]?.toUpperCase() ?? "?"
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold text-sm text-foreground truncate">
                    {t.counterpart?.nama ?? "—"}
                  </p>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {relativeTime(t.last_message_at)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t.booking_type === "carter" ? "Carter" : "Jadwal Tetap"} · {t.origin_city} → {t.destination_city} · {t.travel_time}
                </p>
                <p className="text-xs text-foreground/80 mt-1 truncate">
                  {t.last_message_preview ?? <span className="italic text-muted-foreground">Belum ada pesan</span>}
                </p>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      <BottomNav active="chat" />

      {photoModal && (
        <PhotoLightbox url={photoModal.url} name={photoModal.name} onClose={() => setPhotoModal(null)} />
      )}
    </div>
  );
}
