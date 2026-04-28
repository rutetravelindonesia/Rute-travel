import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Car, Plus, Star, Edit2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";

interface Kendaraan {
  id: number;
  jenis: string;
  merek: string;
  model: string;
  plat_nomor: string;
  warna: string;
  tahun: number;
  foto_url: string;
  is_default: boolean;
}

export default function ProfilKendaraan() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const [list, setList] = useState<Kendaraan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/kendaraan/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setList(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function setDefault(id: number) {
    if (!token) return;
    setBusyId(id);
    try {
      const res = await fetch(`${apiBase}/kendaraan/${id}/set-default`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Kendaraan utama diperbarui" });
        await load();
      } else {
        toast({ title: "Gagal", variant: "destructive" });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (!token) return;
    if (!confirm("Hapus kendaraan ini? Tindakan tidak bisa dibatalkan.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`${apiBase}/kendaraan/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Kendaraan dihapus" });
        await load();
      } else {
        toast({ title: "Gagal menghapus", variant: "destructive" });
      }
    } finally {
      setBusyId(null);
    }
  }

  function fotoSrc(path: string) {
    if (!path) return null;
    return `${apiBase}/storage${path}`;
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-3 bg-card border-b border-border">
        <button
          onClick={() => setLocation("/profil")}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Kendaraan Saya</h1>
          <p className="text-xs text-muted-foreground">{list.length} kendaraan terdaftar</p>
        </div>
      </div>

      <div className="px-5 pt-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-amber-50 flex items-center justify-center">
              <Car className="w-8 h-8 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-foreground mb-1">Belum ada kendaraan</p>
            <p className="text-xs text-muted-foreground">
              Tambahkan kendaraan dulu sebelum bisa membuka jadwal atau Carter.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((k) => {
              const foto = fotoSrc(k.foto_url);
              return (
                <div
                  key={k.id}
                  className="bg-card rounded-2xl border border-border overflow-hidden"
                  data-testid={`kendaraan-card-${k.id}`}
                >
                  {foto && (
                    <div className="w-full h-40 bg-muted overflow-hidden">
                      <img src={foto} alt={`${k.merek} ${k.model}`} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-bold text-foreground">
                            {k.merek} {k.model}
                          </p>
                          {k.is_default && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-accent text-white px-2 py-0.5 rounded-full">
                              Utama
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {k.jenis} · {k.warna} · {k.tahun}
                        </p>
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded-lg px-3 py-2 mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Plat Nomor
                      </p>
                      <p className="text-sm font-bold text-foreground">{k.plat_nomor}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!k.is_default && (
                        <button
                          onClick={() => setDefault(k.id)}
                          disabled={busyId === k.id}
                          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted/40 transition-colors"
                        >
                          <Star className="w-3 h-3" />
                          Jadikan Utama
                        </button>
                      )}
                      <button
                        onClick={() => setLocation(`/profil/kendaraan/${k.id}`)}
                        disabled={busyId === k.id}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted/40 transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => remove(k.id)}
                        disabled={busyId === k.id || (k.is_default && list.length === 1)}
                        className="flex items-center justify-center w-9 h-9 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={() => setLocation("/profil/kendaraan/baru")}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-accent text-white font-bold text-sm hover:bg-accent/90 active:bg-accent/80 transition-colors shadow-lg"
          data-testid="add-kendaraan-button"
        >
          <Plus className="w-4 h-4" />
          Tambah Kendaraan
        </button>
      </div>
    </div>
  );
}
