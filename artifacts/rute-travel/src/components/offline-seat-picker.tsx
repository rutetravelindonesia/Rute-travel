import { useEffect, useState } from "react";
import { User, X, Lock } from "lucide-react";

interface Props {
  open: boolean;
  scheduleId: number;
  capacity: number;
  initialOffline: string[];
  bookedSeats: string[];
  apiBase: string;
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function buildSeatLayout(capacity: number): { rows: string[][] } {
  if (capacity < 1) return { rows: [] };
  const rows: string[][] = [["1"]];
  let n = 2;
  while (n <= capacity) {
    const r: string[] = [];
    for (let i = 0; i < 3 && n <= capacity; i++, n++) r.push(String(n));
    rows.push(r);
  }
  return { rows };
}

export default function OfflineSeatPicker({
  open,
  scheduleId,
  capacity,
  initialOffline,
  bookedSeats,
  apiBase,
  token,
  onClose,
  onSaved,
}: Props) {
  const bookedSet = new Set(bookedSeats);
  const cleanInitial = initialOffline.filter((k) => !bookedSet.has(k));
  const overlap = initialOffline.filter((k) => bookedSet.has(k));
  const [selected, setSelected] = useState<string[]>(cleanInitial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(initialOffline.filter((k) => !bookedSet.has(k)));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialOffline.join(","), bookedSeats.join(",")]);

  if (!open) return null;
  const layout = buildSeatLayout(capacity);

  function toggle(k: string) {
    if (bookedSet.has(k)) return;
    setSelected((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/schedules/${scheduleId}/offline-seats`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kursi_offline: selected }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Gagal menyimpan kursi.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Gangguan jaringan, coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="offline-seat-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-md rounded-t-3xl pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-foreground">Catat Penumpang Offline</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tandai kursi yang sudah dipesan langsung (bukan lewat app), supaya tidak diambil penumpang online.
            </p>
          </div>
          <button
            data-testid="btn-close-offline-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>

        <div className="px-5">
          <div className="flex items-center gap-3 text-[10px] mb-3 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border-2 border-border bg-background" /> Kosong
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-600" /> Penumpang offline
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-muted-foreground/40" /> Penumpang online
            </span>
          </div>

          <div className="bg-muted/40 rounded-2xl p-4">
            <div className="flex items-end justify-between gap-3 mb-1">
              <div className="flex flex-col items-center">
                <SeatBox
                  num="1"
                  state={
                    bookedSet.has("1")
                      ? "booked"
                      : selected.includes("1")
                      ? "offline"
                      : "free"
                  }
                  onClick={() => toggle("1")}
                  testId="offline-seat-1"
                />
                <span className="text-[9px] text-muted-foreground tracking-widest mt-1">DEPAN</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-xl bg-foreground text-card flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <span className="text-[9px] text-muted-foreground tracking-widest mt-1">SOPIR</span>
              </div>
            </div>
            <div className="border-t border-dashed border-border my-3" />
            <div className="space-y-2">
              {layout.rows.slice(1).map((row, ri) => (
                <div key={ri} className="grid grid-cols-3 gap-2 justify-items-center">
                  {row.map((k) => (
                    <SeatBox
                      key={k}
                      num={k}
                      state={
                        bookedSet.has(k)
                          ? "booked"
                          : selected.includes(k)
                          ? "offline"
                          : "free"
                      }
                      onClick={() => toggle(k)}
                      testId={`offline-seat-${k}`}
                    />
                  ))}
                  {row.length < 3 &&
                    Array.from({ length: 3 - row.length }).map((_, i) => (
                      <span key={`pad-${i}`} />
                    ))}
                </div>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground tracking-widest mt-3 text-center">
              BAGASI
            </p>
          </div>

          {overlap.length > 0 && (
            <p
              data-testid="offline-overlap-note"
              className="mt-3 text-[11px] text-amber-800 bg-amber-50 rounded-xl p-2 leading-snug"
            >
              Kursi {overlap.join(", ")} sebelumnya Anda tandai offline, tapi sekarang sudah dipesan online. Tanda offline-nya otomatis dilepas saat Anda menyimpan.
            </p>
          )}

          {error && (
            <p
              data-testid="offline-error"
              className="mt-3 text-xs text-red-600 bg-red-50 rounded-xl p-2"
            >
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              data-testid="btn-cancel-offline"
              onClick={onClose}
              className="py-3 rounded-xl border border-border text-sm font-semibold text-foreground"
            >
              Batal
            </button>
            <button
              data-testid="btn-save-offline"
              onClick={save}
              disabled={saving}
              className="py-3 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: "hsl(var(--accent))" }}
            >
              {saving ? "Menyimpan..." : `Simpan (${selected.length} kursi)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeatBox({
  num,
  state,
  onClick,
  testId,
}: {
  num: string;
  state: "free" | "offline" | "booked";
  onClick: () => void;
  testId: string;
}) {
  const cls =
    state === "booked"
      ? "bg-muted-foreground/40 text-card cursor-not-allowed"
      : state === "offline"
      ? "bg-green-600 text-white"
      : "bg-card border-2 border-border text-foreground hover:bg-muted";
  return (
    <button
      type="button"
      data-testid={testId}
      data-state={state}
      onClick={onClick}
      disabled={state === "booked"}
      className={`relative w-12 h-12 rounded-xl text-sm font-bold flex items-center justify-center transition-colors ${cls}`}
    >
      {num}
      {(state === "offline" || state === "booked") && (
        <Lock className="absolute top-1 right-1 w-2.5 h-2.5" />
      )}
    </button>
  );
}
