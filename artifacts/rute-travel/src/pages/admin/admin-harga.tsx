import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Plus, Trash2, X } from "lucide-react";

interface RoutePrice { id: number; origin_city: string; destination_city: string; harga: string; updated_at: string; }

export default function AdminHarga() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<RoutePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [origin, setOrigin] = useState(""); const [dest, setDest] = useState(""); const [harga, setHarga] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/harga`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function handleAdd() {
    if (!origin || !dest || !harga) return;
    setBusy(true); setError(null);
    const r = await fetch(`${apiBase}/admin/harga`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ origin_city: origin, destination_city: dest, harga: Number(harga) }),
    });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "Gagal."); setBusy(false); return; }
    setShowForm(false); setOrigin(""); setDest(""); setHarga("");
    await load(); setBusy(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus harga rute ini?")) return;
    await fetch(`${apiBase}/admin/harga/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  const fmtRp = (n: string | number) => "Rp " + new Intl.NumberFormat("id-ID").format(Number(n));

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1208]">Pengaturan Harga</h1>
          <button onClick={() => { setShowForm(true); setError(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#a85e28] text-white rounded-xl text-sm font-semibold">
            <Plus className="w-4 h-4" /> Tambah Rute
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Belum ada harga rute yang dikonfigurasi.</div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f0e8]">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Rute</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Harga Default</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Terakhir Diupdate</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(rp => (
                    <tr key={rp.id} className="hover:bg-[#f5f0e8]/50">
                      <td className="px-4 py-3 font-medium">{rp.origin_city} → {rp.destination_city}</td>
                      <td className="px-4 py-3 font-semibold text-[#a85e28]">{fmtRp(rp.harga)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(rp.updated_at).toLocaleDateString("id-ID")}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(rp.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#1a1208]">Tambah Harga Rute</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            {error && <div className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            {[
              { label: "Kota Asal", val: origin, set: setOrigin, ph: "cth: Samarinda" },
              { label: "Kota Tujuan", val: dest, set: setDest, ph: "cth: Balikpapan" },
              { label: "Harga (Rp)", val: harga, set: setHarga, ph: "cth: 150000" },
            ].map(({ label, val, set, ph }) => (
              <div key={label} className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase">{label}</label>
                <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none" />
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold">Batal</button>
              <button onClick={handleAdd} disabled={busy || !origin || !dest || !harga}
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
