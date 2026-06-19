import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, CheckCircle2, XCircle, ZoomIn, X, User, Car } from "lucide-react";

interface PendingMitra {
  id: number;
  nama: string;
  no_whatsapp: string;
  kota: string | null;
  model_kendaraan: string | null;
  foto_diri: string | null;
  foto_stnk: string | null;
  created_at: string;
}

export default function AdminVerifikasiMitra() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [list, setList] = useState<PendingMitra[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/pending-mitra`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function handleApprove(id: number, nama: string) {
    if (!confirm(`Setujui pendaftaran mitra "${nama}"?`)) return;
    setBusy(id);
    await fetch(`${apiBase}/admin/users/${id}/approve`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(null);
    await load();
  }

  async function handleReject(id: number, nama: string) {
    if (!confirm(`Tolak dan hapus pendaftaran mitra "${nama}"? Aksi ini tidak bisa dibatalkan.`)) return;
    setBusy(id);
    await fetch(`${apiBase}/admin/users/${id}/reject`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(null);
    await load();
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1208]">Verifikasi Mitra</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Tinjau dan setujui pendaftaran Mitra Driver baru</p>
          </div>
          {!loading && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full">
              {list.length} Pending
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" />
          </div>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="font-semibold text-[#1a1208]">Semua sudah diverifikasi</p>
            <p className="text-sm text-muted-foreground mt-1">Tidak ada pendaftaran mitra yang menunggu persetujuan.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map(m => (
              <div key={m.id} className="bg-white rounded-2xl border border-border overflow-hidden flex flex-col">
                <div className="p-4 space-y-3 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-[#a85e28]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1a1208] truncate">{m.nama}</p>
                      <p className="text-xs text-muted-foreground">{m.no_whatsapp}</p>
                      {m.kota && <p className="text-xs text-muted-foreground">{m.kota}</p>}
                    </div>
                  </div>

                  {m.model_kendaraan && (
                    <div className="flex items-center gap-2 text-sm text-[#1a1208]">
                      <Car className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span>{m.model_kendaraan}</span>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    Daftar: {new Date(m.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Foto Diri (KTP)</p>
                      {m.foto_diri ? (
                        <button
                          onClick={() => setLightbox(m.foto_diri!)}
                          className="w-full aspect-video rounded-lg overflow-hidden bg-[#f5f0e8] relative group"
                        >
                          <img src={m.foto_diri} alt="Foto diri" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ZoomIn className="w-5 h-5 text-white" />
                          </div>
                        </button>
                      ) : (
                        <div className="w-full aspect-video rounded-lg bg-[#f5f0e8] flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">Tidak ada foto</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Foto STNK</p>
                      {m.foto_stnk ? (
                        <button
                          onClick={() => setLightbox(m.foto_stnk!)}
                          className="w-full aspect-video rounded-lg overflow-hidden bg-[#f5f0e8] relative group"
                        >
                          <img src={m.foto_stnk} alt="Foto STNK" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ZoomIn className="w-5 h-5 text-white" />
                          </div>
                        </button>
                      ) : (
                        <div className="w-full aspect-video rounded-lg bg-[#f5f0e8] flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">Tidak ada foto</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 pt-0 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleReject(m.id, m.nama)}
                    disabled={busy === m.id}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {busy === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Tolak
                  </button>
                  <button
                    onClick={() => handleApprove(m.id, m.nama)}
                    disabled={busy === m.id}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {busy === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Setujui
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightbox}
            alt="Preview foto"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </AdminLayout>
  );
}
