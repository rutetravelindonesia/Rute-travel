import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  User, Car, Phone, Lock, Eye, EyeOff, ArrowRight, ArrowLeft,
  IdCard, MapPin, Camera, CheckCircle2, Loader2, RefreshCw,
} from "lucide-react";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { ApiError } from "@workspace/api-client-react";
import { KOTA_GROUPED } from "@/lib/kota";

type UserType = "penumpang" | "driver";
type Step = 1 | 2 | "otp" | "pending_review";

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

async function uploadRegisterPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${apiBase}/storage/register-upload`, { method: "POST", body: fd });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? "Gagal mengunggah foto.");
  }
  const j = await res.json();
  return j.url as string;
}

function PhotoUpload({
  label,
  hint,
  required,
  value,
  onChange,
  example,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  value: string;
  onChange: (url: string) => void;
  example?: React.ReactNode;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const url = await uploadRegisterPhoto(file);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal upload.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {example && <div className="mb-3">{example}</div>}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative w-full rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden ${
          value
            ? "border-green-400 bg-green-50"
            : "border-border bg-muted/40 hover:border-accent/60 hover:bg-accent/5"
        }`}
        style={{ minHeight: 100 }}
      >
        {value ? (
          <div className="flex flex-col items-center gap-2 p-3">
            <img src={value} alt="preview" className="w-full max-h-40 object-cover rounded-lg" />
            <span className="text-xs text-green-700 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Foto berhasil diunggah
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="text-[11px] text-accent font-semibold"
            >
              Ganti foto
            </button>
          </div>
        ) : uploading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Mengunggah...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Camera className="w-7 h-7 text-muted-foreground/50" />
            <span className="text-sm font-medium text-muted-foreground">Ketuk untuk pilih foto</span>
            {hint && <span className="text-[11px] text-muted-foreground/70 text-center px-4">{hint}</span>}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function FotoDiriExample() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-[11px] font-bold text-amber-800 mb-2 uppercase tracking-wide">Contoh foto yang benar</p>
      <div className="flex gap-3">
        <div className="w-16 h-20 rounded-lg bg-amber-100 border border-amber-200 flex flex-col items-center justify-center flex-shrink-0 overflow-hidden">
          <div className="w-7 h-7 rounded-full bg-amber-300 mb-1" />
          <div className="w-10 h-8 rounded-t-lg bg-amber-200" />
        </div>
        <div className="flex-1">
          <ul className="text-[11px] text-amber-700 space-y-1">
            <li>✅ Foto setengah badan (dari pinggang ke atas)</li>
            <li>✅ Wajah terlihat jelas & menghadap kamera</li>
            <li>✅ Latar belakang polos / tidak ramai</li>
            <li>✅ Pencahayaan cukup, foto tidak blur</li>
            <li>❌ Tidak pakai kacamata hitam atau topi</li>
            <li>❌ Tidak selfie dengan filter berlebihan</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function OTPScreen({
  userId,
  noWa,
  onSuccess,
}: {
  userId: number;
  noWa: string;
  onSuccess: (token: string, user: unknown) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) { setError("Masukkan 6 digit kode OTP."); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/verify-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, code }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Kode OTP tidak valid."); return; }
      onSuccess(j.token, j.user);
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/auth/resend-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Gagal kirim ulang OTP."); return; }
      setResent(true);
      setCountdown(60);
      setCode("");
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setResending(false);
    }
  }

  const maskedWa = noWa.replace(/(\d{4})(\d+)(\d{4})/, (_, a, b, c) => `${a}${"*".repeat(b.length)}${c}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "hsl(var(--accent) / 0.15)" }}>
          <Phone className="w-8 h-8" style={{ color: "hsl(var(--accent))" }} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Verifikasi WhatsApp</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Kode OTP dikirim ke<br />
            <span className="font-semibold text-foreground">{maskedWa}</span>
          </p>
        </div>
      </div>

      {resent && (
        <div className="px-4 py-3 rounded-xl text-sm font-medium bg-green-50 text-green-700 text-center">
          ✅ Kode OTP baru sudah dikirim!
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
            Kode OTP (6 digit)
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="_ _ _ _ _ _"
            className="w-full text-center text-2xl font-bold tracking-[0.5em] py-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            Kode berlaku selama 5 menit
          </p>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm font-medium bg-red-50 text-red-600 text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || code.length < 6}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {loading ? "Memverifikasi..." : "Verifikasi & Masuk"}
        </button>
      </form>

      <div className="text-center">
        {countdown > 0 ? (
          <p className="text-sm text-muted-foreground">
            Kirim ulang OTP dalam <span className="font-semibold text-foreground">{countdown}s</span>
          </p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="flex items-center gap-1.5 mx-auto text-sm font-semibold"
            style={{ color: "hsl(var(--accent))" }}
          >
            {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {resending ? "Mengirim..." : "Kirim ulang kode OTP"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { setAuth, user, token } = useAuth();

  useEffect(() => {
    if (token && user) {
      if (user.role === "driver") setLocation("/dashboard-driver");
      else if (user.role === "admin") setLocation("/admin/dashboard");
      else setLocation("/dashboard-penumpang");
    }
  }, [token, user, setLocation]);

  const [userType, setUserType] = useState<UserType>("penumpang");
  const [step, setStep] = useState<Step>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
    nik: "",
    kota: "",
    jenis_kendaraan: "",
    model_kendaraan: "",
    plat_nomor: "",
    foto_diri: "",
    foto_stnk: "",
  });

  const [otpData, setOtpData] = useState<{ userId: number; noWa: string } | null>(null);

  const registerMutation = useRegister();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step === 1) {
      if (form.password !== form.confirmPassword) {
        setError("Password dan konfirmasi password tidak sama.");
        return;
      }
      if (userType === "driver") {
        if (!form.foto_diri) {
          setError("Foto diri wajib diunggah.");
          return;
        }
        setStep(2);
        return;
      }
    }

    const payload = {
      nama: form.name,
      no_whatsapp: form.phone,
      password: form.password,
      role: userType,
      ...(userType === "driver" && {
        nik: form.nik || undefined,
        kota: form.kota || undefined,
        jenis_kendaraan: form.jenis_kendaraan || undefined,
        model_kendaraan: form.model_kendaraan || undefined,
        plat_nomor: form.plat_nomor || undefined,
        foto_diri: form.foto_diri || undefined,
        foto_stnk: form.foto_stnk || undefined,
      }),
    };

    registerMutation.mutate(
      { data: payload },
      {
        onSuccess: (data) => {
          if ("pending_review" in data && data.pending_review) {
            setStep("pending_review");
          } else if ("needs_otp" in data && data.needs_otp) {
            setOtpData({
              userId: (data as { user_id: number }).user_id,
              noWa: form.phone,
            });
            setStep("otp");
          } else if ("token" in data) {
            setAuth(data.token, data.user as Parameters<typeof setAuth>[1]);
            setLocation("/dashboard-driver");
          }
        },
        onError: (err) => {
          if (err instanceof ApiError && err.data && typeof err.data === "object" && "error" in err.data) {
            setError(String((err.data as { error: string }).error));
          } else {
            setError("Terjadi kesalahan. Coba lagi.");
          }
        },
      }
    );
  };

  const isStep1 = step === 1;
  const isStep2 = step === 2;
  const isStepOTP = step === "otp";
  const isStepPending = step === "pending_review";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col px-6 pt-10 pb-8 max-w-md mx-auto w-full">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            type="button"
            data-testid="button-back"
            onClick={() => {
              if (isStepOTP) { setStep(1); setOtpData(null); }
              else if (isStep2) setStep(1);
              else if (isStepPending) setLocation("/login");
              else setLocation("/login");
            }}
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src={import.meta.env.BASE_URL + "logo.jpg"}
              alt="RUTE"
              className="w-9 h-9 rounded-xl object-contain"
            />
            <span className="text-xs font-semibold tracking-widest text-foreground/60 uppercase">RUTE</span>
          </div>
        </div>

        {/* Heading */}
        {!isStepOTP && !isStepPending && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground leading-tight">
              <span style={{ fontFamily: "var(--app-font-serif)" }}>Buat </span>
              <span className="italic" style={{ fontFamily: "var(--app-font-serif)", color: "hsl(var(--accent))" }}>
                akun
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isStep1 ? "Isi data diri Anda untuk mendaftar." : "Lengkapi data kendaraan Anda."}
            </p>
          </div>
        )}

        {/* Step indicator for mitra step 2 */}
        {isStep2 && (
          <div className="flex items-center gap-2 mb-5">
            <div className="flex gap-1.5">
              <div className="w-6 h-1.5 rounded-full bg-muted-foreground/40" />
              <div className="w-6 h-1.5 rounded-full" style={{ backgroundColor: "hsl(var(--accent))" }} />
            </div>
            <span className="text-xs text-muted-foreground">Langkah 2 dari 2 — Data Kendaraan</span>
          </div>
        )}

        {/* Tab selector (step 1 only) */}
        {isStep1 && (
          <div className="bg-muted/60 rounded-2xl p-1 flex mb-5">
            <button
              type="button"
              data-testid="tab-penumpang"
              onClick={() => { setUserType("penumpang"); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${
                userType === "penumpang"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="w-4 h-4" />
              Penumpang
            </button>
            <button
              type="button"
              data-testid="tab-driver"
              onClick={() => { setUserType("driver"); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${
                userType === "driver"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Car className="w-4 h-4" />
              Mitra Driver
            </button>
          </div>
        )}

        {/* OTP Screen */}
        {isStepOTP && otpData && (
          <OTPScreen
            userId={otpData.userId}
            noWa={otpData.noWa}
            onSuccess={(tkn, usr) => {
              setAuth(tkn, usr as Parameters<typeof setAuth>[1]);
              setLocation("/dashboard-penumpang");
            }}
          />
        )}

        {/* Pending Review Screen (mitra driver) */}
        {isStepPending && (
          <div className="flex flex-col items-center text-center py-8 space-y-5">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-amber-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--app-font-serif)" }}>
                Pendaftaran Terkirim!
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Permohonan Anda sebagai Mitra Driver sedang ditinjau oleh tim admin. Silakan coba login kembali setelah akun Anda disetujui.
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left w-full max-w-xs space-y-2">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Langkah selanjutnya</p>
              <ul className="space-y-1.5 text-sm text-amber-700">
                <li className="flex items-start gap-2"><span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>Admin akan memeriksa foto diri dan STNK Anda</li>
                <li className="flex items-start gap-2"><span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>Proses verifikasi biasanya 1×24 jam</li>
                <li className="flex items-start gap-2"><span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>Setelah disetujui, Anda bisa login dan mulai menerima penumpang</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="w-full max-w-xs py-3.5 rounded-xl bg-foreground text-background font-semibold text-sm"
            >
              Kembali ke Login
            </button>
          </div>
        )}

        {/* Registration Form */}
        {!isStepOTP && !isStepPending && (
          <form onSubmit={handleNext} className="space-y-4">
            {/* ── STEP 1 ── */}
            {isStep1 && (
              <>
                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Nama Lengkap</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text" name="name" data-testid="input-name"
                      value={form.name} onChange={handleChange}
                      placeholder="Nama sesuai KTP" required
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Nomor WhatsApp</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="tel" name="phone" data-testid="input-phone"
                      value={form.phone} onChange={handleChange}
                      placeholder="812-3456-7890" required
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPassword ? "text" : "password"} name="password" data-testid="input-password"
                      value={form.password} onChange={handleChange}
                      placeholder="Minimal 8 karakter" required minLength={8}
                      className="w-full pl-10 pr-12 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    />
                    <button type="button" data-testid="toggle-password" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Konfirmasi Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showConfirm ? "text" : "password"} name="confirmPassword" data-testid="input-confirm-password"
                      value={form.confirmPassword} onChange={handleChange}
                      placeholder="Ulangi password" required
                      className="w-full pl-10 pr-12 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    />
                    <button type="button" data-testid="toggle-confirm-password" onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Foto diri — hanya untuk mitra */}
                {userType === "driver" && (
                  <PhotoUpload
                    label="Foto Diri"
                    required
                    hint="Pas foto setengah badan, wajah terlihat jelas"
                    value={form.foto_diri}
                    onChange={(url) => setForm((f) => ({ ...f, foto_diri: url }))}
                    example={<FotoDiriExample />}
                  />
                )}
              </>
            )}

            {/* ── STEP 2 (mitra only) ── */}
            {isStep2 && (
              <>
                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Nomor KTP (NIK)</label>
                  <div className="relative">
                    <IdCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text" name="nik" data-testid="input-nik"
                      value={form.nik} onChange={handleChange}
                      placeholder="16 digit NIK" maxLength={16}
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Kota Domisili</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <select
                      name="kota" data-testid="select-kota"
                      value={form.kota} onChange={handleChange}
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm appearance-none"
                    >
                      <option value="">Pilih kota domisili</option>
                      {KOTA_GROUPED.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.kota.map((k) => (
                            <option key={k} value={k.toLowerCase()}>{k}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Jenis Kendaraan</label>
                  <div className="relative">
                    <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <select
                      name="jenis_kendaraan" data-testid="select-kendaraan"
                      value={form.jenis_kendaraan} onChange={handleChange}
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm appearance-none"
                    >
                      <option value="">Pilih jenis kendaraan</option>
                      <option value="sedan">Sedan</option>
                      <option value="mpv">MPV / Minivan</option>
                      <option value="suv">SUV</option>
                      <option value="hiace">Hiace</option>
                      <option value="elf">Elf</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Model Kendaraan</label>
                  <div className="relative">
                    <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text" name="model_kendaraan"
                      value={form.model_kendaraan} onChange={handleChange}
                      placeholder="Contoh: Avanza, Innova, Hiace"
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">Plat Nomor</label>
                  <div className="relative">
                    <IdCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text" name="plat_nomor" data-testid="input-plat"
                      value={form.plat_nomor} onChange={handleChange}
                      placeholder="Contoh: KT 1234 AB"
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm uppercase"
                    />
                  </div>
                </div>

                <PhotoUpload
                  label="Foto STNK Kendaraan"
                  hint="Pastikan nomor plat, nama, dan tanggal STNK terbaca jelas"
                  value={form.foto_stnk}
                  onChange={(url) => setForm((f) => ({ ...f, foto_stnk: url }))}
                />
              </>
            )}

            {error && (
              <div data-testid="error-message" className="px-4 py-3 rounded-xl text-sm font-medium bg-red-50 text-red-600">
                {error}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                data-testid="button-submit"
                disabled={registerMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
              >
                {registerMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                ) : userType === "driver" && step === 1 ? (
                  <>Lanjut — Data Kendaraan <ArrowRight className="w-4 h-4" /></>
                ) : (
                  <>Daftar sekarang <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </form>
        )}

        {!isStepOTP && !isStepPending && (
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Sudah punya akun?{" "}
              <button type="button" data-testid="link-login" onClick={() => setLocation("/login")}
                className="font-semibold" style={{ color: "hsl(var(--accent))" }}>
                Masuk sekarang
              </button>
            </p>
          </div>
        )}

        <div className="mt-auto pt-8 text-center">
          <p className="text-xs text-muted-foreground/60">RUTE v1.0 · Made in Kalimantan Timur</p>
        </div>
      </div>
    </div>
  );
}
