import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Send, Phone, Loader2, ShieldAlert } from "lucide-react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { useAuth } from "@/contexts/auth";
import { getDriverPhotoUrl } from "@/lib/utils";

interface Message {
  id: number;
  sender_id: number;
  body: string;
  created_at: string;
  is_mine: boolean;
}

interface ThreadDetail {
  id: number;
  booking_type: "schedule" | "carter";
  booking_id: number;
  booking_status: string | null;
  booking: {
    origin_city: string;
    destination_city: string;
    travel_date: string;
    travel_time: string;
  } | null;
  me_role: "penumpang" | "mitra";
  counterpart: { id: number; nama: string; role: string; foto_profil: string | null } | null;
  messages: Message[];
}

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const ARCHIVED = new Set(["selesai", "batal"]);

function timeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatThreadPage() {
  const [, params] = useRoute("/chat/:id");
  const [, setLocation] = useLocation();
  const { token, user } = useAuth();
  const id = Number(params?.id);

  const [data, setData] = useState<ThreadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);
  const [counterpartPhotoError, setCounterpartPhotoError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<number>(0);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
    }
  }, [token, setLocation]);

  useEffect(() => {
    if (!token || !Number.isFinite(id) || id <= 0) return;
    let cancelled = false;
    lastIdRef.current = 0;
    setData(null);
    setLoadError(null);
    setDraft("");
    setSendError(null);
    setCounterpartPhotoError(false);

    async function load() {
      try {
        const url = `${apiBase}/chat/threads/${id}${lastIdRef.current ? `?since=${lastIdRef.current}` : ""}`;
        const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(json?.error ?? "Gagal memuat percakapan.");
          return;
        }
        setLoadError(null);
        if (lastIdRef.current === 0) {
          const newMsgs: Message[] = json.messages;
          if (newMsgs.length) lastIdRef.current = newMsgs[newMsgs.length - 1].id;
          setData(json);
          return;
        }
        setData((prev) => {
          if (!prev) {
            const newMsgs: Message[] = json.messages;
            if (newMsgs.length) lastIdRef.current = newMsgs[newMsgs.length - 1].id;
            return json;
          }
          const newMsgs: Message[] = json.messages;
          if (newMsgs.length === 0) {
            return { ...prev, booking_status: json.booking_status };
          }
          lastIdRef.current = newMsgs[newMsgs.length - 1].id;
          return {
            ...prev,
            booking_status: json.booking_status,
            messages: [...prev.messages, ...newMsgs],
          };
        });
      } catch {
        if (!cancelled) setLoadError("Tidak bisa terhubung ke server.");
      }
    }

    load();
    const interval = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, id]);

  useEffect(() => { setCounterpartPhotoError(false); }, [data?.counterpart?.foto_profil]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages.length]);

  const archived = data?.booking_status ? ARCHIVED.has(data.booking_status) : false;

  async function send() {
    if (!token || !draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch(`${apiBase}/chat/threads/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const json = await r.json();
      if (!r.ok) {
        setSendError(json?.error ?? "Gagal mengirim.");
        return;
      }
      setDraft("");
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, json] } : prev));
      lastIdRef.current = json.id;
    } catch {
      setSendError("Tidak bisa terhubung ke server.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f0ece4] flex flex-col max-w-md mx-auto">
      <div
        className="px-4 pt-10 pb-4 flex items-center gap-3"
        style={{
          background:
            user?.role === "driver"
              ? "linear-gradient(135deg,#e8b86d 0%,#d4975a 35%,#c07840 65%,#a85e28 100%)"
              : "linear-gradient(135deg,#7dd3fc 0%,#38bdf8 35%,#0ea5e9 65%,#0369a1 100%)",
        }}
      >
        <button
          onClick={() => setLocation("/chat")}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
          data-testid="btn-thread-back"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        {(() => {
          const counterpartPhotoUrl = getDriverPhotoUrl(apiBase, data?.counterpart?.foto_profil);
          const showPhoto = !!counterpartPhotoUrl && !counterpartPhotoError;
          return (
            <button
              type="button"
              onClick={() => { if (showPhoto) setPhotoModal({ url: counterpartPhotoUrl!, name: data?.counterpart?.nama ?? "" }); }}
              className={`w-9 h-9 rounded-full bg-white/20 overflow-hidden flex items-center justify-center font-bold text-white text-sm flex-shrink-0 ${showPhoto ? "cursor-zoom-in" : "cursor-default"}`}
              aria-label={showPhoto ? `Lihat foto ${data!.counterpart!.nama}` : undefined}
            >
              {showPhoto ? (
                <img
                  src={counterpartPhotoUrl!}
                  alt={data!.counterpart!.nama}
                  className="w-full h-full object-cover"
                  onError={() => setCounterpartPhotoError(true)}
                />
              ) : (
                data?.counterpart?.nama?.[0]?.toUpperCase() ?? "?"
              )}
            </button>
          );
        })()}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold truncate" data-testid="thread-counterpart">
            {data?.counterpart?.nama ?? "Memuat..."}
          </p>
          {data?.booking && (
            <p className="text-white/80 text-[11px] truncate">
              {data.booking_type === "carter" ? "Carter" : "Jadwal Tetap"} · {data.booking.origin_city} → {data.booking.destination_city} · {data.booking.travel_time}
            </p>
          )}
        </div>
        <button
          disabled
          title="Telepon dalam aplikasi segera hadir"
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center opacity-60 cursor-not-allowed"
          data-testid="btn-call-disabled"
        >
          <Phone className="w-4 h-4 text-white" />
        </button>
      </div>

      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-[11px] text-amber-800">
        <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-px" />
        <p>Demi keamanan, jangan bagikan nomor HP/WhatsApp atau bertransaksi di luar aplikasi. Nomor akan otomatis disensor.</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loadError && (
          <div className="bg-red-50 text-red-700 text-xs rounded-lg px-3 py-2" data-testid="thread-error">
            {loadError}
          </div>
        )}
        {data === null && !loadError && (
          <div className="flex justify-center items-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        )}
        {data?.messages.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-xs">
            Belum ada pesan. Sapa {data.counterpart?.nama ?? "mitra"}!
          </div>
        )}
        {data?.messages.map((m) => (
          <div
            key={m.id}
            data-testid={`msg-${m.id}`}
            className={`flex ${m.is_mine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                m.is_mine
                  ? "bg-[#a85e28] text-white rounded-br-sm"
                  : "bg-card text-foreground rounded-bl-sm"
              }`}
            >
              <p>{m.body}</p>
              <p className={`text-[10px] mt-1 text-right ${m.is_mine ? "text-white/70" : "text-muted-foreground"}`}>
                {timeOnly(m.created_at)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-card px-3 py-3">
        {archived && (
          <p className="text-center text-[11px] text-muted-foreground mb-2">
            Orderan sudah selesai/batal — chat hanya bisa dibaca.
          </p>
        )}
        {sendError && (
          <p className="text-[11px] text-red-700 mb-2" data-testid="send-error">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={archived || sending}
            placeholder={archived ? "Chat ditutup" : "Tulis pesan..."}
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:bg-muted/50 max-h-32"
            data-testid="input-pesan"
          />
          <button
            onClick={send}
            disabled={archived || sending || !draft.trim()}
            className="w-10 h-10 rounded-full bg-[#a85e28] text-white flex items-center justify-center disabled:opacity-40"
            data-testid="btn-kirim"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {photoModal && (
        <PhotoLightbox url={photoModal.url} name={photoModal.name} onClose={() => setPhotoModal(null)} />
      )}
    </div>
  );
}
