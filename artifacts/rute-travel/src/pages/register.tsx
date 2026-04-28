import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { User, Car, Phone, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, IdCard, MapPin } from "lucide-react";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { ApiError } from "@workspace/api-client-react";
import { KOTA_GROUPED } from "@/lib/kota";

type UserType = "penumpang" | "driver";
type Step = 1 | 2;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { setAuth, user, token } = useAuth();

  useEffect(() => {
    if (token && user) {
      if (user.role === "driver") {
        setLocation("/dashboard-driver");
      } else if (user.role === "admin") {
        setLocation("/admin/dashboard");
      } else {
        setLocation("/dashboard-penumpang");
      }
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
    plat_nomor: "",
  });

  const registerMutation = useRegister();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Password dan konfirmasi password tidak sama.");
      return;
    }

    if (userType === "driver" && step === 1) {
      setStep(2);
      return;
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
        plat_nomor: form.plat_nomor || undefined,
      }),
    };

    registerMutation.mutate(
      { data: payload },
      {
        onSuccess: (data) => {
          setAuth(data.token, data.user);
          if (userType === "penumpang") {
            setLocation("/dashboard-penumpang");
          } else {
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col px-6 pt-10 pb-8 max-w-md mx-auto w-full">

        <div className="flex items-center gap-3 mb-10">
          <button
            type="button"
            data-testid="button-back"
            onClick={() => (step === 2 ? setStep(1) : setLocation("/login"))}
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src={import.meta.env.BASE_URL + 'logo.jpg'}
              alt="RUTE"
              className="w-9 h-9 rounded-xl object-contain"
            />
            <span className="text-xs font-semibold tracking-widest text-foreground/60 uppercase">RUTE</span>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground leading-tight">
            <span style={{ fontFamily: 'var(--app-font-serif)' }}>Buat </span>
            <span
              className="italic"
              style={{ fontFamily: 'var(--app-font-serif)', color: 'hsl(var(--accent))' }}
            >
              akun
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {step === 1
              ? "Isi data diri Anda untuk mendaftar."
              : "Lengkapi data kendaraan Anda."}
          </p>
        </div>

        {step === 1 && (
          <div className="bg-muted/60 rounded-2xl p-1 flex mb-6">
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

        {step === 2 && (
          <div className="flex items-center gap-2 mb-6">
            <div className="flex gap-1.5">
              <div className="w-6 h-1.5 rounded-full bg-muted-foreground/40" />
              <div className="w-6 h-1.5 rounded-full" style={{ backgroundColor: 'hsl(var(--accent))' }} />
            </div>
            <span className="text-xs text-muted-foreground">Langkah 2 dari 2 — Data Kendaraan</span>
          </div>
        )}

        <form onSubmit={handleNext} className="space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
                  Nama Lengkap
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    name="name"
                    data-testid="input-name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Nama sesuai KTP"
                    required
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
                  Nomor WhatsApp
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="tel"
                    name="phone"
                    data-testid="input-phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="812-3456-7890"
                    required
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    data-testid="input-password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Minimal 8 karakter"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-12 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm"
                  />
                  <button
                    type="button"
                    data-testid="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
                  Konfirmasi Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showConfirm ? "text" : "password"}
                    name="confirmPassword"
                    data-testid="input-confirm-password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    placeholder="Ulangi password"
                    required
                    className="w-full pl-10 pr-12 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm"
                  />
                  <button
                    type="button"
                    data-testid="toggle-confirm-password"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
                  Nomor KTP (NIK)
                </label>
                <div className="relative">
                  <IdCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    name="nik"
                    data-testid="input-nik"
                    value={form.nik}
                    onChange={handleChange}
                    placeholder="16 digit NIK"
                    maxLength={16}
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
                  Kota Domisili
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    name="kota"
                    data-testid="select-kota"
                    value={form.kota}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm appearance-none"
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
                <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
                  Jenis Kendaraan
                </label>
                <div className="relative">
                  <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    name="jenis_kendaraan"
                    data-testid="select-kendaraan"
                    value={form.jenis_kendaraan}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm appearance-none"
                  >
                    <option value="">Pilih kendaraan</option>
                    <option value="sedan">Sedan</option>
                    <option value="mpv">MPV / Minivan</option>
                    <option value="suv">SUV</option>
                    <option value="hiace">Hiace</option>
                    <option value="elf">Elf</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
                  Plat Nomor
                </label>
                <div className="relative">
                  <IdCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    name="plat_nomor"
                    data-testid="input-plat"
                    value={form.plat_nomor}
                    onChange={handleChange}
                    placeholder="Contoh: KT 1234 AB"
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm uppercase"
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div
              data-testid="error-message"
              className="px-4 py-3 rounded-xl text-sm font-medium"
              style={{ backgroundColor: 'hsl(0 72% 51% / 0.1)', color: 'hsl(0 72% 40%)' }}
            >
              {error}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              data-testid="button-submit"
              disabled={registerMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
            >
              {registerMutation.isPending
                ? "Memproses..."
                : userType === "driver" && step === 1
                  ? "Lanjut — Data Kendaraan"
                  : "Daftar sekarang"}
              {!registerMutation.isPending && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <button
              type="button"
              data-testid="link-login"
              onClick={() => setLocation("/login")}
              className="font-semibold"
              style={{ color: 'hsl(var(--accent))' }}
            >
              Masuk sekarang
            </button>
          </p>
        </div>

        <div className="mt-auto pt-8 text-center">
          <p className="text-xs text-muted-foreground/60">
            RUTE v1.0 · Made in Kalimantan Timur
          </p>
        </div>
      </div>
    </div>
  );
}
