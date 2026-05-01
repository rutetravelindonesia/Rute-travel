import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Search, Pencil, Trash2, X, Check, ShieldOff, ShieldCheck, ZoomIn } from "lucide-react";

interface User {
  id: number; nama: string; no_whatsapp: string; role: string;
  kota: string | null; nik: string | null; created_at: string;
  is_verified: boolean; is_suspended: boolean;
  foto_diri: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  penumpang: "Penumpang", driver: "Mitra Driver", admin: "Admin",
};
const ROLE_COLOR: Record<string, string> = {
  penumpang: "bg-blue-100 text-blue-700",
  driver: "bg-emerald-100 text-emerald-700",
  admin: "bg-red-100 text-red-700",
};

function StatusBadge({ user }: { user: User }) {
  if (user.is_suspended) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        Suspended
      </span>
    );
  }
  if (!user.is_verified) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        Belum Diverifikasi
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      Aktif
    </span>
  );
}

export default function AdminUsers() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [editNama, setEditNama] = useState("");
  const [editRole, setEditRole] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; nama: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (roleFilter) params.set("role", roleFilter);
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [token, q, roleFilter, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function handleEdit() {
    if (!editing || !token) return;
    setBusy(editing.id); setError(null);
    const r = await fetch(`${apiBase}/admin/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nama: editNama, role: editRole }),
    });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "Gagal."); setBusy(null); return; }
    setEditing(null);
    await load();
    setBusy(null);
  }

  async function handleDelete(id: number, nama: string) {
    if (!confirm(`Hapus user "${nama}"? Aksi ini tidak bisa dibatalkan.`)) return;
    setBusy(id);
    await fetch(`${apiBase}/admin/users/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(null);
    await load();
  }

  async function handleSuspend(id: number, nama: string) {
    if (!confirm(`Suspend akun "${nama}"? User tidak bisa login sampai diaktifkan kembali.`)) return;
    setBusy(id);
    await fetch(`${apiBase}/admin/users/${id}/suspend`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(null);
    await load();
  }

  async function handleUnsuspend(id: number, nama: string) {
    if (!confirm(`Aktifkan kembali akun "${nama}"?`)) return;
    setBusy(id);
    await fetch(`${apiBase}/admin/users/${id}/unsuspend`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(null);
    await load();
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[#1a1208]">Manajemen User</h1>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()}
              placeholder="Cari nama atau nomor WA..." className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#a85e28]" />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
            <option value="">Semua Role</option>
            <option value="penumpang">Penumpang</option>
            <option value="driver">Mitra Driver</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={load} className="px-4 py-2.5 bg-[#a85e28] text-white rounded-xl text-sm font-semibold">Cari</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Tidak ada user ditemukan.</div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f0e8]">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Nama</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">No WA</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Role</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Kota</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1a1208] text-xs">Daftar</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map(u => (
                    <tr key={u.id} className={`hover:bg-[#f5f0e8]/50 ${u.is_suspended ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {u.foto_diri ? (
                            <button onClick={() => setPreviewPhoto({ url: u.foto_diri!, nama: u.nama })}
                              className="relative group flex-shrink-0">
                              <img src={u.foto_diri} alt={u.nama}
                                className="w-8 h-8 rounded-full object-cover border border-border" />
                              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <ZoomIn className="w-3.5 h-3.5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#e8dcc8] flex items-center justify-center flex-shrink-0 text-[#a85e28] font-bold text-xs">
                              {u.nama.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium">{u.nama}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.no_whatsapp}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOR[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge user={u} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.kota ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString("id-ID")}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 justify-end items-center">
                          {busy === u.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#a85e28]" />
                          ) : (
                            <>
                              <button onClick={() => { setEditing(u); setEditNama(u.nama); setEditRole(u.role); setError(null); }}
                                title="Edit" className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {u.role !== "admin" && (
                                <>
                                  {u.is_suspended ? (
                                    <button onClick={() => handleUnsuspend(u.id, u.nama)}
                                      title="Aktifkan kembali" className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600">
                                      <ShieldCheck className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <button onClick={() => handleSuspend(u.id, u.nama)}
                                      title="Suspend akun" className="p-1.5 rounded-lg hover:bg-orange-100 text-orange-500">
                                      <ShieldOff className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button onClick={() => handleDelete(u.id, u.nama)}
                                    title="Hapus permanen" className="p-1.5 rounded-lg hover:bg-red-100 text-red-500">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {previewPhoto && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}>
          <div className="relative max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewPhoto(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <img src={previewPhoto.url} alt={previewPhoto.nama}
              className="w-full rounded-2xl object-cover shadow-2xl" />
            <p className="text-center text-white font-semibold mt-3">{previewPhoto.nama}</p>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#1a1208]">Edit User</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            {error && <div className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Nama</label>
              <input value={editNama} onChange={e => setEditNama(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Role</label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-[#f5f0e8] focus:outline-none">
                <option value="penumpang">Penumpang</option>
                <option value="driver">Mitra Driver</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold">Batal</button>
              <button onClick={handleEdit} disabled={busy === editing.id}
                className="flex-1 py-2.5 bg-[#a85e28] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {busy === editing.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
