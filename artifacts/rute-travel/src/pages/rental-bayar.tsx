import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Building2, Copy, Check, Upload, Loader2, ImageIcon, Car, KeyRound, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";

interface RentalBooking {
  id: number;
  mode: "lepas_kunci" | "dengan_sopir";
  tanggal_mulai: string;
  tanggal_selesai: string;
  jam_mulai: string;
  jam_selesai: string;
  total_hari: number;
  harga_per_hari: number;
  deposit: number;
  total_amount: number;
  status: string;
  payment_method: string | null;
  payment_proof_url: string | null;
  driver: { id: number; nama: string; foto_profil: string | null; nama_bank: string | null; no_rekening: string | null; nama_pemilik_rekening: string | null } | null;
  kendaraan: { id: number; jenis: string; merek: string; model: string; warna: string; plat_nomor: string; foto_url: string | null; tahun: number } | null;
}

function formatRupiah(n: number) {
  return "Rp " + (n ?? 0).toLocaleString("id-ID");
}
function longDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
}
function modeLabel(m: string) {
  return m === "lepas_kunci" ? "Lepas Kunci" : "Dengan Sopir";
}

export default function RentalBayar() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/rental-booking/:id/bayar");
  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const { token } = useAuth();
  const { toast } = useToast();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [booking, setBooking] = useState<RentalBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { uploadFile, isUploading } = useUpload({
    basePath: `${apiBase}/storage`,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    onError: (err: Error) => {
      toast({ title: "Gagal unggah foto", description: err.message, variant: "destructive" });
    },
  });

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
        const res = await fetch(`${apiBase}/rental-bookings/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: RentalBooking = await res.json();
          if (!cancelled) {
            setBooking(data);
            if (data.status !== "pending" && data.payment_proof_url) {
              setLocation(`/rental-booking/${id}/etiket`);
            }
          }
        } else if (res.status === 401) {
          setLocation("/login");
        } else {
          const j = await res.json().catch(() => ({}));
          if (!cancelled) setError(j.error ?? "Pesanan tidak ditemukan.");
        }
      } catch {
        if (!cancelled) setError("Koneksi ke server gagal. Coba lagi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, id, apiBase, setLocation]);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
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
    setSubmitting(true);
    try {
      const resp = await uploadFile(file);
      const objectPath = (resp as { objectPath: string }).objectPath;
      const proofRes = await fetch(`${apiBase}/rental-bookings/${booking.id}/payment-proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: objectPath }),
      });
      if (!proofRes.ok) {
        const err = await proofRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal menyimpan bukti.");
      }
      toast({ title: "Bukti diterima", description: "Menunggu verifikasi admin. Voucher diterbitkan setelah dikonfirmasi." });
      setLocation(`/rental-booking/${booking.id}/etiket`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
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

  const isLepasKunci = booking.mode === "lepas_kunci";
  const totalTransfer = booking.total_amount + (isLepasKunci ? booking.deposit : 0);
  const busy = submitting || isUploading;

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
            {isLepasKunci ? <KeyRound className="w-4 h-4 text-amber-500" /> : <UserRound className="w-4 h-4 text-amber-500" />}
            Pembayaran Rental
          </h1>
          <p className="text-xs text-muted-foreground">
            Booking #{booking.id} · {modeLabel(booking.mode)}
          </p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        {/* Ringkasan kendaraan & sewa */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3" data-testid="ringkasan">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {booking.kendaraan?.foto_url ? (
                <img
                  src={booking.kendaraan.foto_url.startsWith("http") ? booking.kendaraan.foto_url : `${apiBase}/storage${booking.kendaraan.foto_url}`}
                  alt={`${booking.kendaraan.merek} ${booking.kendaraan.model}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Car className="w-6 h-6 text-amber-700" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">
                {booking.kendaraan ? `${booking.kendaraan.merek} ${booking.kendaraan.model}` : "—"}
              </p>
              {booking.kendaraan && (
                <p className="text-[11px] text-muted-foreground">
                  {booking.kendaraan.warna} · {booking.kendaraan.plat_nomor} · {booking.kendaraan.tahun}
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-dashed border-border pt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Mulai</p>
              <p className="font-bold text-foreground">{longDate(booking.tanggal_mulai)}</p>
              <p className="text-[11px] text-muted-foreground">{booking.jam_mulai}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Selesai</p>
              <p className="font-bold text-foreground">{longDate(booking.tanggal_selesai)}</p>
              <p className="text-[11px] text-muted-foreground">{booking.jam_selesai}</p>
            </div>
          </div>
        </div>

        {/* Rincian harga */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-2" data-testid="rincian-harga">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{formatRupiah(booking.harga_per_hari)} × {booking.total_hari} hari</span>
            <span className="font-bold text-foreground">{formatRupiah(booking.total_amount)}</span>
          </div>
          {isLepasKunci && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Deposit (dikembalikan)</span>
              <span className="font-bold text-foreground" data-testid="deposit-line">{formatRupiah(booking.deposit)}</span>
            </div>
          )}
          <div className="border-t border-dashed border-border pt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">Total Transfer</span>
            <span className="text-lg font-extrabold text-accent" data-testid="total-transfer">{formatRupiah(totalTransfer)}</span>
          </div>
          {isLepasKunci && (
            <p className="text-[11px] text-muted-foreground">
              Total transfer = {formatRupiah(booking.total_amount)} + deposit {formatRupiah(booking.deposit)}.
            </p>
          )}
        </div>

        {/* Info rekening mitra */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3" data-testid="bank-info">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-orange-700" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground tracking-widest font-bold uppercase">Transfer ke Mitra</p>
              <p className="text-sm font-bold text-foreground">{booking.driver?.nama ?? "—"}</p>
            </div>
          </div>
          {booking.driver?.no_rekening ? (
            <div className="bg-muted/40 rounded-xl p-3 space-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground tracking-widest font-bold uppercase">Bank</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm font-bold text-foreground" data-testid="bank-nama">{booking.driver.nama_bank ?? "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground tracking-widest font-bold uppercase">No. Rekening</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-lg font-extrabold tracking-wider text-foreground" data-testid="bank-rekening">{booking.driver.no_rekening}</p>
                  <button
                    data-testid="copy-rekening"
                    onClick={() => handleCopy(booking.driver!.no_rekening!.replace(/\D/g, ""), "rek")}
                    className="text-xs font-bold text-accent flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/10"
                  >
                    {copied === "rek" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === "rek" ? "Tersalin" : "Salin"}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground tracking-widest font-bold uppercase">Atas Nama</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm font-bold text-foreground" data-testid="bank-pemilik">{booking.driver.nama_pemilik_rekening ?? "—"}</p>
                  {booking.driver.nama_pemilik_rekening && (
                    <button
                      data-testid="copy-pemilik"
                      onClick={() => handleCopy(booking.driver!.nama_pemilik_rekening!, "nama")}
                      className="text-xs font-bold text-accent flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/10"
                    >
                      {copied === "nama" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied === "nama" ? "Tersalin" : "Salin"}
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <p className="text-xs text-amber-700 font-medium">Nominal transfer</p>
                <button
                  data-testid="copy-nominal"
                  onClick={() => handleCopy(String(totalTransfer), "nominal")}
                  className="text-sm font-extrabold text-amber-700 flex items-center gap-1"
                >
                  {formatRupiah(totalTransfer)}
                  {copied === "nominal" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Mitra belum mengisi informasi rekening. Hubungi admin.</p>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Transfer tepat <span className="font-bold text-foreground">{formatRupiah(totalTransfer)}</span> ke rekening di atas. Setelah transfer, unggah bukti agar pembayaran dapat diverifikasi admin.
          </p>
        </div>

        {/* Upload bukti */}
        <div className="bg-card rounded-2xl border-2 border-dashed border-border p-4">
          <p className="text-sm font-bold text-foreground">Unggah Bukti Transfer</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Foto/screenshot bukti pembayaran. JPG/PNG, maks 5 MB. Voucher terbit setelah dikonfirmasi admin.
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
            disabled={busy}
            className="mt-3 w-full py-3 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {busy ? "Mengunggah..." : "Pilih File Bukti"}
          </button>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <ImageIcon className="w-3 h-3" /> Pastikan nominal & rekening tujuan terlihat jelas.
          </div>
        </div>
      </div>
    </div>
  );
}
