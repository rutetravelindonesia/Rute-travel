import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/auth";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [wa, setWa] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ no_whatsapp: wa, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login gagal."); return; }
      setAuth(data.token, data.user);
      setLocation("/admin/dashboard");
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#1a1208] flex items-center justify-center font-black text-white">R</div>
          <div>
            <div className="font-bold text-[#1a1208]">RUTE Admin</div>
            <div className="text-xs text-muted-foreground">Panel Administrasi</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-border p-6 space-y-4">
          <h1 className="text-lg font-bold text-[#1a1208]">Masuk sebagai Admin</h1>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nomor WhatsApp</label>
            <input
              value={wa} onChange={e => setWa(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-[#f5f0e8] focus:outline-none focus:ring-2 focus:ring-[#a85e28]"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={pw} onChange={e => setPw(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-[#f5f0e8] focus:outline-none focus:ring-2 focus:ring-[#a85e28] pr-11"
                required
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1a1208] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Masuk
          </button>
        </form>
      </div>
    </div>
  );
}
