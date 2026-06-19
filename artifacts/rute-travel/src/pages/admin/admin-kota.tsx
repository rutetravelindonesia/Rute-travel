import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { PROVINSI_INDONESIA } from "@/lib/provinsi";
import AdminLayout from "./admin-layout";
import { Loader2, Plus, Trash2, X, Pencil, AlertTriangle } from "lucide-react";

interface Kota { id: number; nama_kota: string; provinsi: string | null; wilayah: string | null; created_at: string; }

const TANPA_PROVINSI = "Belum berprovinsi";

export default function AdminKota() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Kota[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nama, setNama] = useState("");
  const [provinsi, setProvinsi] = useState("");
  const [wilayah, setWilayah] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const kotaRes = await fetch(`${apiBase}/admin/kota`, { headers: { Authorization: `Bearer ${token}` } });
    const kota = await kotaRes.json();
    setRows(Array.isArray(kota) ? kota : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  function openAdd() {
    setEditId(null);
    setNama("");
    setProvinsi("");
    setWilayah("");
    setError(null);
    setShowForm(true);
  }

  function openEdit(k: Kota) {
    setEditId(k.id);
    setNama(k.nama_kota);
    setProvinsi(k.provinsi ?? "");
    setWilayah(k.wilayah ?? "");
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!editId && !nama.trim()) { setError("Nama kota wajib diisi."); return; }
    if (!provinsi) { setError("Provinsi wajib dipilih."); return; }
    setBusy(true); setError(null);
    const r = editId
      ? await fetch(`${apiBase}/admin/kota/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ provinsi, wilayah: wilayah.trim() || null }),
        })
      : await fetch(`${apiBase}/admin/kota`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nama_kota: nama.trim(), provinsi, wilayah: wilayah.trim() || null }),
        });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "Gagal."); setBusy(false); return; }
    setShowForm(false);
    await load(); setBusy(false);
  }

  async function handleDelete(id: number, namaKota: string) {
    if (!confirm(`Hapus kota "${namaKota}"?`)) return;
    await fetch(`${apiBase}/admin/kota/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await load();
  }

  // Group by provinsi; kota tanpa provinsi muncul di grup khusus paling atas
  const tanpaProvinsi = rows.filter(k => !k.provinsi);
  const provinsiSet = new Set<string>(PROVINSI_INDONESIA);
  const grouped = PROVINSI_INDONESIA
    .map(p => ({ provinsi: p, kota: rows.filter(k => k.provinsi === p) }))
    .filter(g => g.kota.length > 0);
  // Kota dengan provinsi non-standar (legacy / salah ketik) — tetap ditampilkan agar bisa diperbaiki
  const provinsiTidakValid = rows.filter(k => !!k.provinsi && !provinsiSet.has(k.provinsi));

  function renderKotaRow(k: Kota) {
    return (
      <div key={k.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#f5f0e8]/50">
        <div>
          <div className="font-medium text-sm">{k.nama_kota}</div>
          <div className="text-xs text-muted-foreground">
            {k.wilayah ? `${k.wilayah} · ` : ""}Ditambahkan {new Date(k.created_at).toLocaleDateString("id-ID")}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => openEdit(k)} className="p-1.5 rounded-lg hover:bg-[#a85e28]/10 text-[#a85e28]" title="Ubah provinsi">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleDelete(k.id, k.nama_kota)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500" title="Hapus">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1208]">Kota & Rute</h1>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-[#a85e28] text-white rounded-xl text-sm font-semibold">
            <Plus className="w-4 h-4" /> Tambah Kota
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Belum ada kota terdaftar.</div>
        ) : (
          <div className="space-y-4">
            {tanpaProvinsi.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-300 overflow-hidden">
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">{TANPA_PROVINSI}</span>
                  <span className="text-[11px] text-amber-700/80 normal-case font-normal">
                    — kota ini tidak akan muncul di pencarian sampai provinsinya diisi
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {tanpaProvinsi.map(renderKotaRow)}
                </div>
              </div>
            )}
            {provinsiTidakValid.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-300 overflow-hidden">
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Provinsi tidak standar</span>
                  <span className="text-[11px] text-amber-700/80 normal-case font-normal">
                    — nama provinsi tidak dikenali, perbaiki agar muncul di pencarian
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {provinsiTidakValid.map(renderKotaRow)}
                </div>
              </div>
            )}
            {grouped.map(g => (
              <div key={g.provinsi} className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 bg-[#f5f0e8] border-b border-border flex items-center justify-between">
                  <span className="text-xs font-bold text-[#a85e28] uppercase tracking-wide">{g.provinsi}</span>
                  <span className="text-[11px] text-muted-foreground">{g.kota.length} kota</span>
                </div>
                <div className="divide-y divide-border">
                  {g.kota.map(renderKotaRow)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#1a1208]">{editId ? "Ubah Kota" : "Tambah Kota Baru"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            {error && <div className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Nama Kota / Kecamatan</label>
                <input value={nama} onChange={e => setNama(e.target.value)} placeholder="cth: Muara Wahau" disabled={!!editId}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none disabled:opacity-60" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Provinsi</label>
                <select
                  value={provinsi}
                  onChange={e => setProvinsi(e.target.value)}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none"
                >
                  <option value="">— Pilih provinsi —</option>
                  {PROVINSI_INDONESIA.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Wilayah / Grup (opsional)</label>
                <input
                  value={wilayah}
                  onChange={e => setWilayah(e.target.value)}
                  placeholder="cth: Kab. Kutai Timur"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold">Batal</button>
              <button onClick={handleSave} disabled={busy || (!editId && !nama.trim()) || !provinsi}
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
