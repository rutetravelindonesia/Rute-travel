import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { User, Car, Phone, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { ApiError } from "@workspace/api-client-react";

type UserType = "penumpang" | "driver";

export default function LoginPage() {
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
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    loginMutation.mutate(
      { data: { no_whatsapp: phone, password, role: userType } },
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

        <div className="flex items-center gap-2 mb-10">
          <img
            src={import.meta.env.BASE_URL + 'logo.jpg'}
            alt="RUTE"
            className="w-9 h-9 rounded-xl object-contain"
          />
          <span className="text-xs font-semibold tracking-widest text-foreground/60 uppercase">RUTE</span>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground leading-tight">
            <span style={{ fontFamily: 'var(--app-font-serif)' }}>Selamat </span>
            <span
              className="italic"
              style={{ fontFamily: 'var(--app-font-serif)', color: 'hsl(var(--accent))' }}
            >
              datang
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-2">Travel antar kota Kaltim dari mitra terpercaya.</p>
        </div>

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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
              Nomor WhatsApp
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="tel"
                data-testid="input-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
                data-testid="input-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
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

          {error && (
            <div
              data-testid="error-message"
              className="px-4 py-3 rounded-xl text-sm font-medium"
              style={{ backgroundColor: 'hsl(0 72% 51% / 0.1)', color: 'hsl(0 72% 40%)' }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              data-testid="link-forgot-password"
              className="text-sm font-medium"
              style={{ color: 'hsl(var(--accent))' }}
            >
              Lupa password?
            </button>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              data-testid="button-login"
              disabled={loginMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
            >
              {loginMutation.isPending
                ? "Memproses..."
                : `Masuk sebagai ${userType === "penumpang" ? "Penumpang" : "Mitra Driver"}`}
              {!loginMutation.isPending && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Belum punya akun?{" "}
            <button
              type="button"
              data-testid="link-register"
              onClick={() => setLocation("/daftar")}
              className="font-semibold"
              style={{ color: 'hsl(var(--accent))' }}
            >
              Daftar sekarang
            </button>
          </p>
        </div>

        <div className="mt-auto pt-10 text-center">
          <p className="text-xs text-muted-foreground/60">
            RUTE v1.0 · Made in Kalimantan Timur
          </p>
        </div>
      </div>
    </div>
  );
}
