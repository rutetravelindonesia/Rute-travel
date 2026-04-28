import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Building2, Copy, Check, QrCode, Wallet, Upload, Loader2, ImageIcon, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";

interface CarterBooking {
  id: number;
  settings_id: number;
  origin_city: string;
  destination_city: string;
  travel_date: string;
  travel_time: string;
  pickup_label: string;
  dropoff_label: string;
  total_amount: number;
  payment_method: "qris" | "transfer" | "ewallet";
  payment_proof_url: string | null;
  status: string;
  driver: { id: number; nama: string } | null;
}

const REKENING = {
  bank: "BNI",
  nomor: "1788-4718-39",
  nomorPlain: "1788471839",
  atasNama: "PT. ALVI UTAMA KARYA",
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function longDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
}

export default function CarterBayar() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/carter-booking/:id/bayar");
  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const { token } = useAuth();
  const { toast } = useToast();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [booking, setBooking] = useState<CarterBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<"qris" | "transfer" | "ewallet">("transfer");
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    if (isNaN(id)) {
      setError("ID booking tidak valid.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/carter-bookings/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: CarterBooking = await res.json();
          if (!cancelled) {
            setBooking(data);
            setMethod(data.payment_method);
            if (data.status !== "pending" && data.payment_proof_url) {
              setLocation(`/carter-booking/${id}/etiket`);
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, id, apiBase, setLocation]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Gagal menyalin", variant: "destructive" });
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file || !booking) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Hanya file gambar", description: "Unggah foto bukti transfer (JPG/PNG).", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File terlalu besar", description: "Maks 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const reqRes = await fetch(`${apiBase}/storage/uploads/request-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!reqRes.ok) throw new Error("Gagal meminta URL upload.");
      const { uploadURL, objectPath } = (await reqRes.json()) as { uploadURL: string; objectPath: string };

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Gagal upload file.");

      const proofRes = await fetch(`${apiBase}/carter-bookings/${booking.id}/payment-proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: objectPath }),
      });
      if (!proofRes.ok) {
        const err = await proofRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal menyimpan bukti.");
      }

      toast({ title: "Bukti diterima", description: "Menunggu konfirmasi mitra. E-tiket diterbitkan." });
      setLocation(`/carter-booking/${booking.id}/etiket`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }
  if (error || !booking) {
    return (
      <div className="min-h-screen bg-background max-w-md mx-auto p-6 text-center">
        <p className="text-sm font-bold text-foreground mt-12" data-testid="bayar-error">
          {error ?? "Pesanan tidak ditemukan."}
        </p>
        <button onClick={() => setLocation("/dashboard-penumpang")} className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold">
          Ke beranda
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      <div className="bg-card border-b border-border px-5 pt-10 pb-4 flex items-center gap-3">
        <button
          data-testid="back-btn"
          onClick={() => window.history.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Pembayaran Carter
          </h1>
          <p className="text-xs text-muted-foreground">
            Booking #{booking.id} · {booking.origin_city} → {booking.destination_city}
          </p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Total tagihan */}
        <div className="bg-accent text-white rounded-2xl p-4">
          <p className="text-[10px] font-bold tracking-widest uppercase opacity-80">Total Tagihan Carter</p>
          <p className="text-3xl font-extrabold mt-1" data-testid="total-tagihan">{formatRupiah(booking.total_amount)}</p>
          <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-[11px]">
            <span>Sewa penuh 1 mobil</span>
            <span>{longDate(booking.travel_date)} · {booking.travel_time}</span>
          </div>
        </div>

        {/* Method tabs */}
        <div className="bg-card rounded-2xl border border-border p-2 flex gap-1">
          {[
            { v: "transfer" as const, label: "Transfer", Icon: Building2 },
            { v: "qris" as const, label: "QRIS", Icon: QrCode },
            { v: "ewallet" as const, label: "E-Wallet", Icon: Wallet },
          ].map(({ v, label, Icon }) => (
            <button
              key={v}
              data-testid={`method-${v}`}
              onClick={() => setMethod(v)}
              className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1 ${
                method === v ? "bg-accent text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {method === "transfer" && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3" data-testid="transfer-detail">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center font-extrabold text-orange-700 text-xs">BNI</div>
              <div>
                <p className="text-[10px] text-muted-foreground tracking-widest font-bold uppercase">Transfer ke</p>
                <p className="text-sm font-bold text-foreground">Bank BNI</p>
              </div>
            </div>
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground tracking-widest font-bold uppercase">No. Rekening</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-lg font-extrabold tracking-wider text-foreground" data-testid="rekening-nomor">{REKENING.nomor}</p>
                <button
                  data-testid="copy-rekening"
                  onClick={() => handleCopy(REKENING.nomorPlain)}
                  className="text-xs font-bold text-accent flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/10"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Tersalin" : "Salin"}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground tracking-widest font-bold uppercase mt-3">Atas Nama</p>
              <p className="text-sm font-bold text-foreground mt-1">{REKENING.atasNama}</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Transfer tepat <span className="font-bold text-foreground">{formatRupiah(booking.total_amount)}</span> ke rekening di atas. Setelah transfer, unggah bukti agar e-tiket otomatis terbit.
            </p>
          </div>
        )}

        {method === "qris" && (
          <div className="bg-card rounded-2xl border border-border p-4 text-center" data-testid="qris-detail">
            <p className="text-[10px] text-muted-foreground tracking-widest font-bold uppercase">Scan QRIS</p>
            <div className="mx-auto my-3 w-48 h-48 rounded-2xl border-4 border-foreground bg-white flex items-center justify-center">
              <div className="text-center">
                <QrCode className="w-24 h-24 mx-auto text-foreground" />
                <p className="text-[10px] text-muted-foreground mt-2">QR statis tujuan {REKENING.atasNama}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Buka aplikasi e-banking/e-wallet, scan QR, dan bayar <span className="font-bold text-foreground">{formatRupiah(booking.total_amount)}</span>. Setelah bayar, unggah bukti di bawah.
            </p>
          </div>
        )}

        {method === "ewallet" && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-2" data-testid="ewallet-detail">
            <p className="text-sm font-bold text-foreground">Transfer via E-Wallet</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Buka aplikasi e-wallet (DANA, OVO, GoPay, ShopeePay), pilih <span className="font-bold">Transfer ke Rekening Bank</span>, lalu kirim ke:
            </p>
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">BNI · {REKENING.nomor}</p>
              <p className="text-sm font-bold text-foreground">{REKENING.atasNama}</p>
              <p className="text-xs text-muted-foreground mt-1">Nominal: <span className="font-bold text-foreground">{formatRupiah(booking.total_amount)}</span></p>
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl border-2 border-dashed border-border p-4">
          <p className="text-sm font-bold text-foreground">Unggah Bukti Transfer</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Foto/screenshot bukti pembayaran. JPG/PNG, maks 5 MB. E-tiket akan terbit setelah unggah.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            data-testid="file-input"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            data-testid="upload-btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-3 w-full py-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Mengunggah..." : "Pilih File Bukti"}
          </button>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <ImageIcon className="w-3 h-3" /> Pastikan nominal & rekening tujuan terlihat jelas.
          </div>
        </div>
      </div>
    </div>
  );
}
