import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Plus, Trash2, X, Send } from "lucide-react";

interface Announcement {
  id: number; judul: string; isi: string; target: string; created_at: string;
  admin: { nama: string } | null;
}

const TARGET_LABEL: Record<string, string> = {
  all: "Semua User", penumpang: "Penumpang", driver: "Mitra Driver",
};

export default function AdminPengumuman() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [judul, setJudul] = useState(""); const [isi, setIsi] = useState(""); const [target, setTarget] = useState("all");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/pengumuman`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function handleSend() {
    if (!judul.trim() || !isi.trim()) return;
    setBusy(true); setError(null);
    const r = await fetch(`${apiBase}/admin/pengumuman`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ judul, isi, target }),
    });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "Gagal."); setBusy(false); return; }
    setShowForm(false); setJudul(""); setIsi(""); setTarget("all");
    await load(); setBusy(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus pengumuman ini?")) return;
    await fetch(`${apiBase}/admin/pengumuman/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1208]">Pengumuman</h1>
          <button onClick={() => { setShowForm(true); setError(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#a85e28] text-white rounded-xl text-sm font-semibold">
            <Plus className="w-4 h-4" /> Buat Pengumuman
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Belum ada pengumuman.</div>
        ) : (
          <div className="space-y-3">
            {rows.map(a => (
              <div key={a.id} className="bg-white rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-[#1a1208]">{a.judul}</h3>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {TARGET_LABEL[a.target] ?? a.target}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{a.isi}</p>
                    <div className="text-xs text-muted-foreground">
                      Oleh {a.admin?.nama ?? "-"} · {new Date(a.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#1a1208]">Buat Pengumuman</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            {error && <div className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Judul</label>
              <input value={judul} onChange={e => setJudul(e.target.value)} placeholder="Judul pengumuman..."
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Isi</label>
              <textarea value={isi} onChange={e => setIsi(e.target.value)} placeholder="Isi pengumuman..." rows={4}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none resize-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Target</label>
              <select value={target} onChange={e => setTarget(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none">
                <option value="all">Semua User</option>
                <option value="penumpang">Penumpang</option>
                <option value="driver">Mitra Driver</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold">Batal</button>
              <button onClick={handleSend} disabled={busy || !judul.trim() || !isi.trim()}
                className="flex-1 py-2.5 bg-[#a85e28] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Kirim
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
