import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Plus, Trash2, X } from "lucide-react";

interface Kota { id: number; nama_kota: string; created_at: string; }

export default function AdminKota() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Kota[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nama, setNama] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/kota`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function handleAdd() {
    if (!nama.trim()) return;
    setBusy(true); setError(null);
    const r = await fetch(`${apiBase}/admin/kota`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nama_kota: nama.trim() }),
    });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "Gagal."); setBusy(false); return; }
    setNama(""); setShowForm(false);
    await load(); setBusy(false);
  }

  async function handleDelete(id: number, nama: string) {
    if (!confirm(`Hapus kota "${nama}"?`)) return;
    await fetch(`${apiBase}/admin/kota/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1208]">Kota & Rute</h1>
          <button onClick={() => { setShowForm(true); setNama(""); setError(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#a85e28] text-white rounded-xl text-sm font-semibold">
            <Plus className="w-4 h-4" /> Tambah Kota
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Belum ada kota terdaftar.</div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {rows.map(k => (
                <div key={k.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#f5f0e8]/50">
                  <div>
                    <div className="font-medium text-sm">{k.nama_kota}</div>
                    <div className="text-xs text-muted-foreground">Ditambahkan {new Date(k.created_at).toLocaleDateString("id-ID")}</div>
                  </div>
                  <button onClick={() => handleDelete(k.id, k.nama_kota)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#1a1208]">Tambah Kota Baru</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            {error && <div className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <input value={nama} onChange={e => setNama(e.target.value)} placeholder="Nama kota, cth: Samarinda"
              className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none"
              onKeyDown={e => e.key === "Enter" && handleAdd()} />
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold">Batal</button>
              <button onClick={handleAdd} disabled={busy || !nama.trim()}
                className="flex-1 py-2.5 bg-[#a85e28] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
