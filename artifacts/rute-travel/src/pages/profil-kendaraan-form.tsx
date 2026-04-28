import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Camera, Save, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";

const JENIS_OPTIONS = ["MPV", "SUV", "Sedan", "Hatchback", "Hiace", "Elf", "Pick-up", "Lainnya"];
const WARNA_OPTIONS = ["Hitam", "Putih", "Silver", "Abu-abu", "Merah", "Biru", "Kuning", "Hijau", "Coklat", "Lainnya"];

const TAHUN_NOW = new Date().getFullYear();

interface KendaraanForm {
  jenis: string;
  merek: string;
  model: string;
  plat_nomor: string;
  warna: string;
  tahun: string;
  foto_url: string;
  is_default: boolean;
}

const EMPTY: KendaraanForm = {
  jenis: "",
  merek: "",
  model: "",
  plat_nomor: "",
  warna: "",
  tahun: String(TAHUN_NOW),
  foto_url: "",
  is_default: false,
};

export default function ProfilKendaraanForm() {
  const [, setLocation] = useLocation();
  const [matchEdit, paramsEdit] = useRoute("/profil/kendaraan/:id");
  const { token } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editingId = matchEdit && paramsEdit?.id !== "baru" ? parseInt(paramsEdit.id, 10) : null;
  const isEdit = editingId !== null && !isNaN(editingId);

  const [form, setForm] = useState<KendaraanForm>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    onSuccess: (resp: { objectPath: string }) => {
      setForm((f) => ({ ...f, foto_url: resp.objectPath }));
      toast({ title: "Foto berhasil diunggah" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal unggah foto", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!isEdit || !token) return;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/kendaraan/${editingId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const k = await res.json();
          setForm({
            jenis: k.jenis,
            merek: k.merek,
            model: k.model,
            plat_nomor: k.plat_nomor,
            warna: k.warna,
            tahun: String(k.tahun),
            foto_url: k.foto_url,
            is_default: k.is_default,
          });
        }
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [isEdit, editingId, token, apiBase]);

  function set<K extends keyof KendaraanForm>(field: K, value: KendaraanForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function onPickFile() {
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "File harus berupa gambar", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Ukuran maksimal 10MB", variant: "destructive" });
      return;
    }
    await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function isValid() {
    const tahun = parseInt(form.tahun, 10);
    return (
      form.jenis &&
      form.merek.trim() &&
      form.model.trim() &&
      form.plat_nomor.trim() &&
      form.warna &&
      !isNaN(tahun) &&
      tahun >= 1980 &&
      tahun <= TAHUN_NOW + 1 &&
      form.foto_url
    );
  }

  async function handleSave() {
    if (!isValid() || !token) return;
    setLoading(true);
    try {
      const body = {
        jenis: form.jenis,
        merek: form.merek.trim(),
        model: form.model.trim(),
        plat_nomor: form.plat_nomor.trim().toUpperCase(),
        warna: form.warna,
        tahun: parseInt(form.tahun, 10),
        foto_url: form.foto_url,
        is_default: form.is_default,
      };
      const url = isEdit ? `${apiBase}/kendaraan/${editingId}` : `${apiBase}/kendaraan`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Gagal menyimpan");
      }
      toast({ title: isEdit ? "Kendaraan diperbarui" : "Kendaraan ditambahkan" });
      setLocation("/profil/kendaraan");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menyimpan";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (loadingExisting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const fotoPreview = form.foto_url ? `${apiBase}/storage${form.foto_url}` : null;

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-3 bg-card border-b border-border">
        <button
          onClick={() => setLocation("/profil/kendaraan")}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">{isEdit ? "Edit Kendaraan" : "Tambah Kendaraan"}</h1>
          <p className="text-xs text-muted-foreground">Isi semua kolom yang ditandai</p>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-5">
        {/* Foto */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">Foto Kendaraan</h2>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="hidden"
            data-testid="foto-input"
          />

          {fotoPreview ? (
            <div className="relative">
              <div className="w-full aspect-video rounded-xl overflow-hidden bg-muted">
                <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <button
                onClick={onPickFile}
                disabled={isUploading}
                className="mt-2 w-full py-2.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted/40 transition-colors"
              >
                Ganti Foto
              </button>
            </div>
          ) : (
            <button
              onClick={onPickFile}
              disabled={isUploading}
              className="w-full aspect-video rounded-xl border-2 border-dashed border-border hover:border-accent/40 flex flex-col items-center justify-center gap-2 transition-colors"
            >
              {isUploading ? (
                <>
                  <div className="w-6 h-6 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                  <span className="text-xs text-muted-foreground">Mengunggah {progress}%</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-semibold">Tap untuk pilih foto</span>
                  <span className="text-[10px] text-muted-foreground">Maks 10MB</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Info Kendaraan */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Informasi Kendaraan</h2>

          {/* Jenis */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Jenis Kendaraan
            </label>
            <select
              value={form.jenis}
              onChange={(e) => set("jenis", e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">Pilih jenis...</option>
              {JENIS_OPTIONS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          {/* Merek + Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Merek
              </label>
              <input
                type="text"
                value={form.merek}
                onChange={(e) => set("merek", e.target.value)}
                placeholder="Toyota"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Model
              </label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="Avanza"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          {/* Plat Nomor */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Plat Nomor
            </label>
            <input
              type="text"
              value={form.plat_nomor}
              onChange={(e) => set("plat_nomor", e.target.value.toUpperCase())}
              placeholder="KT 1234 AB"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 uppercase"
            />
          </div>

          {/* Warna + Tahun */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Warna
              </label>
              <select
                value={form.warna}
                onChange={(e) => set("warna", e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">Pilih warna...</option>
                {WARNA_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Tahun
              </label>
              <input
                type="number"
                value={form.tahun}
                onChange={(e) => set("tahun", e.target.value)}
                placeholder={String(TAHUN_NOW)}
                min={1980}
                max={TAHUN_NOW + 1}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          {/* Set as default */}
          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => set("is_default", e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-xs text-foreground">Jadikan kendaraan utama</span>
          </label>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!isValid() || loading || isUploading}
          className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg ${
            isValid() && !loading && !isUploading
              ? "bg-accent text-white hover:bg-accent/90 active:bg-accent/80"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
          data-testid="save-kendaraan-button"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah Kendaraan"}
        </button>
      </div>
    </div>
  );
}
