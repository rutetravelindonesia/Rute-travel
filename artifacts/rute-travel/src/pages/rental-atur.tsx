import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MapPin, Wallet, Save, Car, Power, Pencil, Trash2, Loader2, KeyRound, UserRound, FileText } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useKota, groupKota } from "@/hooks/useKota";
import { CitySelect } from "@/components/city-select";
import { PROVINSI_INDONESIA } from "@/lib/provinsi";
import { resolvePhotoUrl } from "@/lib/photoUrl";

interface Kendaraan {
  id: number;
  jenis: string;
  merek: string;
  model: string;
  plat_nomor: string;
  is_default: boolean;
}

type RentalMode = "lepas_kunci" | "dengan_sopir" | "dua-duanya";

interface RentalOffer {
  id: number;
  kota: string;
  mode: RentalMode;
  harga_lepas_kunci: number | null;
  harga_dengan_sopir: number | null;
  deposit: number | null;
  catatan: string | null;
  is_active: boolean;
  kendaraan: {
    id: number;
    jenis: string;
    merek: string;
    model: string;
    warna: string;
    plat_nomor: string;
    foto_url: string | null;
    tahun: number | null;
  } | null;
}

const MODE_OPTIONS: { value: RentalMode; label: string }[] = [
  { value: "lepas_kunci", label: "Lepas Kunci" },
  { value: "dengan_sopir", label: "Dengan Sopir" },
  { value: "dua-duanya", label: "Dua-duanya" },
];

const MODE_LABEL: Record<RentalMode, string> = {
  lepas_kunci: "Lepas Kunci",
  dengan_sopir: "Dengan Sopir",
  "dua-duanya": "Lepas Kunci & Dengan Sopir",
};

function offersLepas(mode: RentalMode) {
  return mode === "lepas_kunci" || mode === "dua-duanya";
}
function offersSopir(mode: RentalMode) {
  return mode === "dengan_sopir" || mode === "dua-duanya";
}
function fmtNum(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}
function fmtRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function RentalAtur() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const { kota } = useKota();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const [kendaraanList, setKendaraanList] = useState<Kendaraan[]>([]);
  const [kendaraanId, setKendaraanId] = useState<number | null>(null);
  const [loadingKendaraan, setLoadingKendaraan] = useState(true);

  const [provinsi, setProvinsi] = useState<string>("");
  const [kotaSel, setKotaSel] = useState<string>("");
  const [mode, setMode] = useState<RentalMode>("lepas_kunci");
  const [hargaLepas, setHargaLepas] = useState<string>("");
  const [hargaSopir, setHargaSopir] = useState<string>("");
  const [deposit, setDeposit] = useState<string>("");
  const [catatan, setCatatan] = useState<string>("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [offers, setOffers] = useState<RentalOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    (async () => {
      try {
        const resKend = await fetch(`${apiBase}/kendaraan/mine`, { headers: { Authorization: `Bearer ${token}` } });
        if (resKend.ok) {
          const list: Kendaraan[] = await resKend.json();
          setKendaraanList(list);
          setKendaraanId((curr) => {
            if (curr !== null && list.some((k) => k.id === curr)) return curr;
            const def = list.find((k) => k.is_default) ?? list[0];
            return def ? def.id : null;
          });
        }
      } finally {
        setLoadingKendaraan(false);
      }
    })();
  }, [token, apiBase, setLocation]);

  async function loadOffers() {
    if (!token) return;
    setLoadingOffers(true);
    try {
      const res = await fetch(`${apiBase}/rental/offer/mine`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setOffers(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoadingOffers(false);
    }
  }

  useEffect(() => {
    loadOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const kotaGrouped = useMemo(
    () => (provinsi ? groupKota(kota.filter((k) => k.provinsi === provinsi)) : []),
    [kota, provinsi],
  );

  function resetForm() {
    setEditingId(null);
    setKotaSel("");
    setProvinsi("");
    setMode("lepas_kunci");
    setHargaLepas("");
    setHargaSopir("");
    setDeposit("");
    setCatatan("");
  }

  function startEdit(o: RentalOffer) {
    setEditingId(o.id);
    if (o.kendaraan) setKendaraanId(o.kendaraan.id);
    setKotaSel(o.kota);
    const k = kota.find((x) => x.nama_kota === o.kota);
    setProvinsi(k?.provinsi ?? "");
    setMode(o.mode);
    setHargaLepas(o.harga_lepas_kunci ? String(o.harga_lepas_kunci) : "");
    setHargaSopir(o.harga_dengan_sopir ? String(o.harga_dengan_sopir) : "");
    setDeposit(o.deposit ? String(o.deposit) : "");
    setCatatan(o.catatan ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const isValid = useMemo(() => {
    if (kendaraanId === null) return false;
    if (!kotaSel) return false;
    if (offersLepas(mode)) {
      const v = parseInt(hargaLepas, 10);
      if (isNaN(v) || v <= 0) return false;
    }
    if (offersSopir(mode)) {
      const v = parseInt(hargaSopir, 10);
      if (isNaN(v) || v <= 0) return false;
    }
    return true;
  }, [kendaraanId, kotaSel, mode, hargaLepas, hargaSopir]);

  async function handleSave() {
    if (!isValid || !token || kendaraanId === null) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        kendaraan_id: kendaraanId,
        kota: kotaSel,
        mode,
        catatan: catatan.trim() || undefined,
      };
      if (offersLepas(mode)) {
        body.harga_lepas_kunci = parseInt(hargaLepas, 10);
        const dep = parseInt(deposit, 10);
        body.deposit = isNaN(dep) ? 0 : dep;
      }
      if (offersSopir(mode)) {
        body.harga_dengan_sopir = parseInt(hargaSopir, 10);
      }
      const url = editingId ? `${apiBase}/rental/offer/${editingId}` : `${apiBase}/rental/offer`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal menyimpan");
      }
      toast({ title: "Berhasil", description: editingId ? "Penawaran rental diperbarui." : "Penawaran rental dibuat." });
      resetForm();
      await loadOffers();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menyimpan";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleOffer(id: number) {
    if (!token) return;
    setBusyId(id);
    try {
      const res = await fetch(`${apiBase}/rental/offer/${id}/toggle`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal mengubah status");
      }
      await loadOffers();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal mengubah status";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteOffer(id: number) {
    if (!token) return;
    if (!confirm("Hapus penawaran rental ini?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`${apiBase}/rental/offer/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal menghapus");
      }
      if (editingId === id) resetForm();
      await loadOffers();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menghapus";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-3 bg-card border-b border-border">
        <button
          onClick={() => setLocation("/dashboard-driver")}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Atur Rental Kendaraan</h1>
          <p className="text-xs text-muted-foreground">Sewakan kendaraan Anda per hari</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-5">
        {/* SECTION 0: Kendaraan */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Kendaraan</h2>
          </div>
          {loadingKendaraan ? (
            <div className="flex justify-center py-3">
              <div className="w-5 h-5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
            </div>
          ) : kendaraanList.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Belum ada kendaraan terdaftar. Tambahkan dulu sebelum menyewakan kendaraan.
              </p>
              <button
                type="button"
                onClick={() => setLocation("/profil/kendaraan/baru")}
                className="w-full py-2.5 rounded-xl bg-accent text-white text-xs font-bold"
              >
                Tambah Kendaraan
              </button>
            </div>
          ) : kendaraanList.length === 1 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Otomatis dipakai</p>
              <p className="text-sm font-bold text-foreground">
                {kendaraanList[0].merek} {kendaraanList[0].model} · {kendaraanList[0].plat_nomor}
              </p>
            </div>
          ) : (
            <select
              value={kendaraanId ?? ""}
              onChange={(e) => setKendaraanId(parseInt(e.target.value, 10))}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 appearance-none"
              data-testid="select-kendaraan-rental"
            >
              {kendaraanList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.merek} {k.model} · {k.plat_nomor}
                  {k.is_default ? " (utama)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* SECTION 1: Kota */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Kota Layanan</h2>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Provinsi
            </label>
            <select
              data-testid="rental-provinsi"
              value={provinsi}
              onChange={(e) => {
                setProvinsi(e.target.value);
                setKotaSel("");
              }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">Pilih provinsi</option>
              {PROVINSI_INDONESIA.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Kota
            </label>
            <CitySelect
              testId="rental-kota"
              value={kotaSel}
              disabled={!provinsi}
              onChange={(v) => setKotaSel(v)}
              groups={kotaGrouped}
              placeholder={provinsi ? "Pilih kota..." : "Pilih provinsi dulu"}
            />
          </div>
        </div>

        {/* SECTION 2: Mode */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Mode Rental</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                data-testid={`mode-${m.value}`}
                className={`py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-colors ${
                  mode === m.value
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-background text-foreground hover:border-accent/40"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 3: Harga per Hari */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Harga per Hari</h2>
          </div>
          <p className="text-xs text-red-500">Aplikasi mengambil biaya 10% dari harga yang anda input.</p>

          {offersLepas(mode) && (
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> Harga Lepas Kunci / hari
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  data-testid="input-harga-lepas"
                  value={hargaLepas ? fmtNum(parseInt(hargaLepas, 10) || 0) : ""}
                  onChange={(e) => setHargaLepas(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
          )}

          {offersSopir(mode) && (
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <UserRound className="w-3 h-3" /> Harga Dengan Sopir / hari
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  data-testid="input-harga-sopir"
                  value={hargaSopir ? fmtNum(parseInt(hargaSopir, 10) || 0) : ""}
                  onChange={(e) => setHargaSopir(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
          )}

          {offersLepas(mode) && (
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Deposit (lepas kunci, opsional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  data-testid="input-deposit"
                  value={deposit ? fmtNum(parseInt(deposit, 10) || 0) : ""}
                  onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Deposit dikembalikan setelah kendaraan dikembalikan dengan baik.</p>
            </div>
          )}
        </div>

        {/* SECTION 4: Catatan */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Catatan (opsional)</h2>
          </div>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
            placeholder="Syarat & ketentuan, area antar, dll."
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        {/* TOMBOL SIMPAN */}
        <div className="pt-1 flex gap-2">
          {editingId && (
            <button
              onClick={resetForm}
              className="px-4 py-4 rounded-2xl border border-border text-sm font-bold text-muted-foreground"
            >
              Batal
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className={`flex-1 py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg ${
              isValid && !saving
                ? "bg-accent text-white hover:bg-accent/90 active:bg-accent/80"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Menyimpan..." : editingId ? "Perbarui Penawaran" : "Simpan Penawaran"}
          </button>
        </div>

        {/* DAFTAR PENAWARAN */}
        <div className="space-y-3 pt-2">
          <h2 className="text-sm font-bold text-foreground">Penawaran Saya</h2>
          {loadingOffers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : offers.length === 0 ? (
            <div className="bg-card rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm font-semibold text-foreground">Belum ada penawaran rental</p>
              <p className="text-xs text-muted-foreground mt-1.5">Buat penawaran di atas untuk mulai menyewakan kendaraan Anda.</p>
            </div>
          ) : (
            offers.map((o) => {
              const foto = resolvePhotoUrl(o.kendaraan?.foto_url ?? null, apiBase);
              return (
                <div key={o.id} className="bg-card rounded-2xl border border-border overflow-hidden" data-testid={`offer-${o.id}`}>
                  <div className="flex gap-3 p-4">
                    <div className="w-16 h-16 rounded-xl bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {foto ? (
                        <img src={foto} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Car className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-foreground truncate">
                          {o.kendaraan ? `${o.kendaraan.merek} ${o.kendaraan.model}` : "Kendaraan"}
                        </p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                          {o.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {o.kota}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{MODE_LABEL[o.mode]}</p>
                      <div className="mt-1 space-y-0.5">
                        {o.harga_lepas_kunci != null && o.harga_lepas_kunci > 0 && (
                          <p className="text-xs font-semibold text-foreground">Lepas kunci: {fmtRupiah(o.harga_lepas_kunci)}/hari</p>
                        )}
                        {o.harga_dengan_sopir != null && o.harga_dengan_sopir > 0 && (
                          <p className="text-xs font-semibold text-foreground">Dengan sopir: {fmtRupiah(o.harga_dengan_sopir)}/hari</p>
                        )}
                        {o.deposit != null && o.deposit > 0 && (
                          <p className="text-[11px] text-muted-foreground">Deposit: {fmtRupiah(o.deposit)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border/60 px-4 py-2.5 flex items-center gap-2">
                    <button
                      onClick={() => toggleOffer(o.id)}
                      disabled={busyId === o.id}
                      data-testid={`toggle-offer-${o.id}`}
                      className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {busyId === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                      {o.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button
                      onClick={() => startEdit(o)}
                      data-testid={`edit-offer-${o.id}`}
                      className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => deleteOffer(o.id)}
                      disabled={busyId === o.id}
                      data-testid={`delete-offer-${o.id}`}
                      className="py-2 px-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-semibold flex items-center justify-center disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
