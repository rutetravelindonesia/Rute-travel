import { useEffect, useState, useRef } from "react";
import { resolvePhotoUrl } from "@/lib/photoUrl";
import { useLocation } from "wouter";
import {
  ArrowLeft, Car, User as UserIcon, LogOut, ChevronRight, Phone,
  Bell, BellOff, Lock, HelpCircle, FileText, Shield, Info,
  Star, TrendingUp, Users, MapPin, MessageCircle, ChevronDown,
  ChevronUp, CheckCircle, AlertCircle, X, Eye, EyeOff, Mail, Camera, Loader2, Landmark,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { BottomNav } from "@/components/bottom-nav";
import { useLogout } from "@workspace/api-client-react";

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const APP_VERSION = "1.0.0";
const CS_WA = "6287868215823";
const CS_EMAIL = "support@ruteindonesia.com";

type Modal = null | "editProfil" | "gantiPassword" | "ratingList" | "faq" | "syarat" | "privasi" | "rekening";

interface IncomeSummary {
  bulan_ini: number;
  total: number;
  trip_selesai: number;
  total_penumpang: number;
}

interface RatingItem {
  id: number;
  stars: number;
  comment: string | null;
  created_at: string;
  rater_nama: string;
}

interface RatingSummary {
  avg: number;
  count: number;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat Pagi";
  if (h < 15) return "Selamat Siang";
  if (h < 18) return "Selamat Sore";
  return "Selamat Malam";
}

function formatRupiah(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".0", "")} jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return `Rp ${n.toLocaleString("id")}`;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${s <= Math.round(value) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30 fill-muted-foreground/10"}`}
        />
      ))}
    </span>
  );
}

function MenuItem({
  icon,
  label,
  sub,
  onClick,
  iconBg = "bg-muted",
  iconColor = "text-muted-foreground",
  last = false,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
  iconBg?: string;
  iconColor?: string;
  last?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors text-left ${!last ? "border-b border-border" : ""}`}
    >
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {badge ?? <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
    </button>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/70 px-1 mb-2">{title}</p>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">{children}</div>
    </div>
  );
}

const CROP_CANVAS_SIZE = 300;
const CROP_OUTPUT_SIZE = 480;

function CropModal({
  src,
  onConfirm,
  onCancel,
}: {
  src: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);

  const radius = CROP_CANVAS_SIZE / 2 - 12;

  function clampOffset(ox: number, oy: number, s: number, img: HTMLImageElement) {
    const halfW = (img.width * s) / 2;
    const halfH = (img.height * s) / 2;
    const maxX = Math.max(0, halfW - radius);
    const maxY = Math.max(0, halfH - radius);
    return {
      x: Math.min(maxX, Math.max(-maxX, ox)),
      y: Math.min(maxY, Math.max(-maxY, oy)),
    };
  }

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const fitScale = (radius * 2) / Math.min(img.width, img.height);
      setScale(fitScale);
      setOffset({ x: 0, y: 0 });
      setImgLoaded(true);
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const S = CROP_CANVAS_SIZE;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2 + offset.x, S / 2 + offset.y);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, S, S);
    ctx.arc(S / 2, S / 2, radius, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
  }, [offset, scale, imgLoaded, radius]);

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const img = imgRef.current;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => img ? clampOffset(o.x + dx, o.y + dy, scale, img) : o);
  }
  function onMouseUp() { dragging.current = false; }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const img = imgRef.current;
    setScale((s) => {
      const minScale = img ? (radius * 2) / Math.min(img.width, img.height) : 0.1;
      const next = Math.min(Math.max(s * (1 - e.deltaY * 0.001), minScale), 10);
      if (img) setOffset((o) => clampOffset(o.x, o.y, next, img));
      return next;
    });
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      dragging.current = true;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPinchDist.current = null;
    } else if (e.touches.length === 2) {
      dragging.current = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.hypot(dx, dy);
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const img = imgRef.current;
    if (e.touches.length === 1 && dragging.current) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setOffset((o) => img ? clampOffset(o.x + dx, o.y + dy, scale, img) : o);
    } else if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / lastPinchDist.current;
      lastPinchDist.current = dist;
      setScale((s) => {
        const minScale = img ? (radius * 2) / Math.min(img.width, img.height) : 0.1;
        const next = Math.min(Math.max(s * ratio, minScale), 10);
        if (img) setOffset((o) => clampOffset(o.x, o.y, next, img));
        return next;
      });
    }
  }
  function onTouchEnd() { dragging.current = false; lastPinchDist.current = null; }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img) return;
    const S = CROP_CANVAS_SIZE;
    const srcLeft = ((S / 2 - radius - S / 2 - offset.x) / scale) + img.width / 2;
    const srcTop  = ((S / 2 - radius - S / 2 - offset.y) / scale) + img.height / 2;
    const srcSize = (radius * 2) / scale;
    const out = document.createElement("canvas");
    out.width = CROP_OUTPUT_SIZE;
    out.height = CROP_OUTPUT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, srcLeft, srcTop, srcSize, srcSize, 0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
    out.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black max-w-md mx-auto">
      <div className="flex items-center justify-between w-full px-5 py-4 flex-shrink-0">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-white/70 text-sm">
          <X className="w-5 h-5" /> Batal
        </button>
        <p className="text-white font-semibold text-sm">Sesuaikan Foto</p>
        <div className="w-16" />
      </div>
      <p className="text-white/50 text-xs mb-5">Seret atau cubit untuk mengatur posisi</p>
      <canvas
        ref={canvasRef}
        width={CROP_CANVAS_SIZE}
        height={CROP_CANVAS_SIZE}
        style={{ touchAction: "none", cursor: "grab", borderRadius: 12, display: "block" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
      <button
        onClick={handleConfirm}
        className="mt-8 px-10 py-3.5 rounded-2xl font-bold text-sm bg-white text-black active:opacity-80"
      >
        Gunakan Foto Ini
      </button>
    </div>
  );
}

function ModalSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-end transition-all duration-300 max-w-md mx-auto ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative bg-card rounded-t-3xl shadow-2xl transition-transform duration-300 flex flex-col overflow-hidden ${open ? "translate-y-0" : "translate-y-full"}`}
        style={{ maxHeight: "90dvh" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 overscroll-contain" style={{ WebkitOverflowScrolling: "touch" as any }}>{children}</div>
      </div>
    </div>
  );
}

const FAQ_PENUMPANG = [
  { q: "Bagaimana cara memesan kursi?", a: "Cari jadwal di menu Cari, pilih jadwal yang sesuai, pilih kursi, isi titik jemput & antar, lalu lanjut bayar. Upload bukti pembayaran setelah transfer." },
  { q: "Metode pembayaran apa yang tersedia?", a: "Tersedia pembayaran via QRIS, Transfer Bank, dan E-Wallet. Setelah pembayaran, upload bukti pembayaran agar sopir dapat mengkonfirmasi." },
  { q: "Apakah saya bisa membatalkan pesanan?", a: "Pembatalan hanya bisa dilakukan minimal 24 jam sebelum jam keberangkatan. Buka pesanan Anda di menu Pesanan, lalu pilih Batalkan." },
  { q: "Apa itu Tebengan Pulang?", a: "Tebengan Pulang adalah layanan berbagi kursi kosong dari mitra driver yang sedang dalam perjalanan pulang. Harganya biasanya lebih terjangkau." },
  { q: "Bagaimana jika sopir terlambat menjemput?", a: "Anda bisa menghubungi sopir langsung melalui fitur Chat di aplikasi. Nomor WA sopir tidak ditampilkan demi keamanan." },
  { q: "Apakah data saya aman?", a: "Nomor WhatsApp dan informasi pribadi Anda dilindungi. Nomor tidak akan dibagikan langsung ke sopir — komunikasi melalui fitur chat terenkripsi." },
];

const FAQ_MITRA = [
  { q: "Bagaimana cara menambah jadwal?", a: "Di dashboard, pilih 'Jadwal Tetap' → 'Tambah Jadwal'. Isi rute, tanggal, jam, kapasitas, dan harga per kursi." },
  { q: "Bagaimana cara mencatat penumpang offline?", a: "Di kartu jadwal aktif, tap tombol 'Penumpang Offline'. Pilih kursi yang sudah terisi agar sistem mengurangi kursi tersisa dengan tepat." },
  { q: "Kapan saya mendapat rating dari penumpang?", a: "Penumpang bisa memberi rating setelah perjalanan berstatus Selesai. Rating membantu membangun reputasi Anda di platform." },
  { q: "Bagaimana cara memulai perjalanan?", a: "Di dashboard, tap 'Mulai Jemput' saat Anda berangkat menjemput. Lanjutkan ke 'Mulai Berangkat' dan 'Tandai Selesai' saat tiba." },
  { q: "Apa itu layanan Carter?", a: "Carter adalah layanan sewa kendaraan privat untuk rute fleksibel. Anda bisa mengatur harga dan menerima tawaran dari penumpang yang membutuhkan." },
  { q: "Bagaimana cara menarik penghasilan?", a: "Penghasilan dihitung dari total pembayaran penumpang yang dikonfirmasi. Sistem rekap tersedia di halaman Akun → Rekap Penghasilan." },
];

export default function ProfilPage() {
  const [, setLocation] = useLocation();
  const { user, token, setAuth, clearAuth } = useAuth();
  const logoutMutation = useLogout();
  const isDriver = user?.role === "driver";

  const [modal, setModal] = useState<Modal>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [editForm, setEditForm] = useState({ nama: user?.nama ?? "", no_whatsapp: user?.no_whatsapp ?? "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [editOk, setEditOk] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const [pwForm, setPwForm] = useState({ password_lama: "", password_baru: "", konfirmasi: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [showPw, setShowPw] = useState({ lama: false, baru: false, konfirm: false });

  const [rekeningForm, setRekeningForm] = useState({ nama_bank: "", no_rekening: "", nama_pemilik_rekening: "" });
  const [rekeningError, setRekeningError] = useState<string | null>(null);
  const [rekeningOk, setRekeningOk] = useState(false);
  const [rekeningLoading, setRekeningLoading] = useState(false);

  const [income, setIncome] = useState<IncomeSummary | null>(null);
  const [ratings, setRatings] = useState<RatingItem[] | null>(null);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const notifToggling = useRef(false);

  const [fotoProfil, setFotoProfil] = useState<string | null>(null);
  const [fotoUploading, setFotoUploading] = useState(false);
  const [fotoError, setFotoError] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (fotoInputRef.current) fotoInputRef.current.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) setCropSrc(ev.target.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleCropConfirm(blob: Blob) {
    if (!token) return;
    setCropSrc(null);
    setFotoUploading(true);
    setFotoError(null);
    try {
      const formData = new FormData();
      formData.append("file", blob, "foto-profil.jpg");
      const uploadResp = await fetch(`${apiBase}/storage/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadResp.ok) throw new Error("Gagal upload foto");
      const { objectPath } = await uploadResp.json();

      const saveResp = await fetch(`${apiBase}/users/me/foto-profil`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ foto_profil: objectPath }),
      });
      if (!saveResp.ok) throw new Error("Gagal menyimpan foto");
      const data = await saveResp.json();
      setFotoProfil(data.foto_profil);
    } catch (err: any) {
      setFotoError(err?.message ?? "Upload foto gagal");
    } finally {
      setFotoUploading(false);
    }
  }

  const initials = user?.nama ? getInitials(user.nama) : "??";

  useEffect(() => {
    if (!user || !token) return;
    fetch(`${apiBase}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data?.foto_profil) setFotoProfil(data.foto_profil);
        if (data?.nama_bank) setRekeningForm({ nama_bank: data.nama_bank ?? "", no_rekening: data.no_rekening ?? "", nama_pemilik_rekening: data.nama_pemilik_rekening ?? "" });
      })
      .catch(() => {});
    if (isDriver) {
      fetch(`${apiBase}/users/me/income-summary`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setIncome)
        .catch(() => {});
      fetch(`${apiBase}/users/${user.id}/rating-summary`)
        .then((r) => r.json())
        .then(setRatingSummary)
        .catch(() => {});
    }
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setNotifEnabled(!!sub))
        .catch(() => {});
    }
  }, [user, token, isDriver]);

  async function loadRatings() {
    if (!token) return;
    const r = await fetch(`${apiBase}/users/me/ratings-received`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setRatings(await r.json());
  }

  async function handleEditProfil(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setEditLoading(true);
    setEditError(null);
    setEditOk(false);
    try {
      const res = await fetch(`${apiBase}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error ?? "Gagal menyimpan."); return; }
      setAuth(token, { ...user!, ...data });
      setEditOk(true);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPwLoading(true);
    setPwError(null);
    setPwOk(false);
    try {
      const res = await fetch(`${apiBase}/users/me/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(pwForm),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error ?? "Gagal mengganti password."); return; }
      setPwOk(true);
      setPwForm({ password_lama: "", password_baru: "", konfirmasi: "" });
    } finally {
      setPwLoading(false);
    }
  }

  async function handleSaveRekening(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setRekeningLoading(true);
    setRekeningError(null);
    setRekeningOk(false);
    try {
      const res = await fetch(`${apiBase}/users/me/rekening`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(rekeningForm),
      });
      const data = await res.json();
      if (!res.ok) { setRekeningError(data.error ?? "Gagal menyimpan."); return; }
      setRekeningOk(true);
    } finally {
      setRekeningLoading(false);
    }
  }

  async function handleToggleNotif() {
    if (notifToggling.current) return;
    notifToggling.current = true;
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        alert("Browser Anda tidak mendukung push notifikasi.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        if (token) {
          await fetch(`${apiBase}/push/subscribe`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
        setNotifEnabled(false);
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { alert("Izin notifikasi ditolak."); return; }
        const keyRes = await fetch(`${apiBase}/push/vapid-public-key`);
        const { publicKey } = await keyRes.json() as { publicKey: string };
        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(base64);
        const key = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
        const newSub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const json = newSub.toJSON();
        if (token) {
          await fetch(`${apiBase}/push/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint: newSub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } }),
          });
        }
        setNotifEnabled(true);
      }
    } finally {
      notifToggling.current = false;
    }
  }

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => { clearAuth(); setLocation("/login"); },
      onError: () => { clearAuth(); setLocation("/login"); },
    });
  }

  const accentGrad = isDriver
    ? "linear-gradient(135deg, #e8b86d 0%, #d4975a 35%, #c07840 65%, #a85e28 100%)"
    : "linear-gradient(135deg, #7dd3fc 0%, #38bdf8 35%, #0ea5e9 65%, #0369a1 100%)";

  return (
    <div className="min-h-screen bg-[#f0ece4] max-w-md mx-auto pb-28">
      {/* HERO */}
      <div className="relative px-5 pt-10 pb-8" style={{ background: accentGrad }}>
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFotoChange}
        />
        <div className="flex items-center gap-4 mb-4">
          <button
            className="relative w-16 h-16 rounded-full flex-shrink-0 border-2 border-white/40 overflow-hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
            onClick={() => fotoInputRef.current?.click()}
            title="Ganti foto profil"
            disabled={fotoUploading}
          >
            {fotoUploading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            ) : fotoProfil ? (
              <img
                src={resolvePhotoUrl(fotoProfil, apiBase) ?? ""}
                alt="Foto profil"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-white font-bold text-lg">{initials}</span>
            )}
            {!fotoUploading && (
              <div className="absolute bottom-0 right-0 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow">
                <Camera className="w-3 h-3 text-gray-600" />
              </div>
            )}
          </button>
          <div className="flex-1 min-w-0">
            {fotoError && (
              <p className="text-[10px] text-red-200 mb-1">{fotoError}</p>
            )}
            <p className="text-[10px] font-bold tracking-widest uppercase text-white/60">
              {getGreeting()} 👋
            </p>
            <p className="text-lg font-bold text-white truncate">{user?.nama ?? "-"}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/20 text-white">
                {isDriver ? "MITRA DRIVER" : "PENUMPANG"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-white/70 text-xs">
          <Phone className="w-3.5 h-3.5" />
          <span>{user?.no_whatsapp ?? "-"}</span>
        </div>
        <div className="absolute -bottom-4 left-0 right-0 h-8 bg-[#f0ece4]" style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
      </div>

      <div className="px-4 pt-6 space-y-5">
        {/* MITRA STATS */}
        {isDriver && income && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-2xl border border-border p-4 col-span-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Penghasilan Bulan Ini</p>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{formatRupiah(income.bulan_ini)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total keseluruhan: {formatRupiah(income.total)}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Trip Selesai</p>
                <MapPin className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-xl font-bold text-foreground">{income.trip_selesai}</p>
              <p className="text-xs text-muted-foreground">perjalanan</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Penumpang</p>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xl font-bold text-foreground">{income.total_penumpang}</p>
              <p className="text-xs text-muted-foreground">dilayani</p>
            </div>
          </div>
        )}

        {/* MITRA RATING */}
        {isDriver && ratingSummary && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">Rating Saya</p>
                <div className="flex items-center gap-2">
                  <Stars value={ratingSummary.avg} />
                  <span className="text-lg font-bold text-foreground">
                    {ratingSummary.avg > 0 ? ratingSummary.avg.toFixed(1) : "-"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ratingSummary.count > 0 ? `dari ${ratingSummary.count} ulasan` : "Belum ada ulasan"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { loadRatings(); setModal("ratingList"); }}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
              >
                Lihat semua
              </button>
            </div>
          </div>
        )}

        {/* PROFIL */}
        <MenuGroup title="Profil">
          <MenuItem
            icon={<UserIcon className="w-5 h-5" />}
            label="Edit Profil"
            sub="Ubah nama & nomor WhatsApp"
            iconBg="bg-blue-50"
            iconColor="text-blue-500"
            onClick={() => { setEditForm({ nama: user?.nama ?? "", no_whatsapp: user?.no_whatsapp ?? "" }); setEditOk(false); setEditError(null); setModal("editProfil"); }}
          />
          <MenuItem
            icon={<Lock className="w-5 h-5" />}
            label="Ganti Password"
            sub="Perbarui kata sandi akun"
            iconBg="bg-purple-50"
            iconColor="text-purple-500"
            last
            onClick={() => { setPwForm({ password_lama: "", password_baru: "", konfirmasi: "" }); setPwOk(false); setPwError(null); setModal("gantiPassword"); }}
          />
        </MenuGroup>

        {/* MITRA: KENDARAAN */}
        {isDriver && (
          <MenuGroup title="Kendaraan">
            <MenuItem
              icon={<Car className="w-5 h-5" />}
              label="Kendaraan Saya"
              sub="Kelola armada kendaraan"
              iconBg="bg-amber-50"
              iconColor="text-amber-500"
              last
              onClick={() => setLocation("/profil/kendaraan")}
            />
          </MenuGroup>
        )}

        {/* MITRA: REKENING */}
        {isDriver && (
          <MenuGroup title="Informasi Rekening">
            <MenuItem
              icon={<Landmark className="w-5 h-5" />}
              label="Rekening Bank"
              sub={rekeningForm.no_rekening ? `${rekeningForm.nama_bank} · ${rekeningForm.no_rekening}` : "Belum diisi — isi agar admin bisa transfer"}
              iconBg="bg-green-50"
              iconColor="text-green-600"
              last
              onClick={() => { setRekeningOk(false); setRekeningError(null); setModal("rekening"); }}
            />
          </MenuGroup>
        )}

        {/* PENUMPANG: AKTIVITAS */}
        {!isDriver && (
          <MenuGroup title="Aktivitas">
            <MenuItem
              icon={<MapPin className="w-5 h-5" />}
              label="Riwayat Perjalanan"
              sub="Semua pesanan Anda"
              iconBg="bg-green-50"
              iconColor="text-green-500"
              last
              onClick={() => setLocation("/pesanan")}
            />
          </MenuGroup>
        )}

        {/* MITRA: PERFORMA */}
        {isDriver && (
          <MenuGroup title="Performa">
            <MenuItem
              icon={<Star className="w-5 h-5" />}
              label="Rating & Ulasan"
              sub={ratingSummary && ratingSummary.count > 0 ? `${ratingSummary.avg.toFixed(1)} bintang · ${ratingSummary.count} ulasan` : "Belum ada ulasan"}
              iconBg="bg-amber-50"
              iconColor="text-amber-400"
              last
              onClick={() => { loadRatings(); setModal("ratingList"); }}
            />
          </MenuGroup>
        )}

        {/* PENGATURAN */}
        <MenuGroup title="Pengaturan">
          <MenuItem
            icon={notifEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            label="Notifikasi Push"
            sub={notifEnabled ? "Notifikasi aktif di perangkat ini" : "Tap untuk mengaktifkan notifikasi"}
            iconBg={notifEnabled ? "bg-green-50" : "bg-muted"}
            iconColor={notifEnabled ? "text-green-500" : "text-muted-foreground"}
            last
            onClick={handleToggleNotif}
            badge={
              <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-1 ${notifEnabled ? "bg-green-500" : "bg-muted-foreground/30"}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${notifEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </div>
            }
          />
        </MenuGroup>

        {/* BANTUAN */}
        <MenuGroup title="Bantuan">
          <MenuItem
            icon={<HelpCircle className="w-5 h-5" />}
            label="FAQ"
            sub="Pertanyaan yang sering diajukan"
            iconBg="bg-sky-50"
            iconColor="text-sky-500"
            onClick={() => { setOpenFaq(null); setModal("faq"); }}
          />
          <MenuItem
            icon={<MessageCircle className="w-5 h-5" />}
            label="Hubungi CS via WhatsApp"
            sub="Jam layanan 08.00 – 20.00 WITA"
            iconBg="bg-green-50"
            iconColor="text-green-500"
            onClick={() => window.open(`https://wa.me/${CS_WA}?text=Halo%20admin%20RUTE%2C%20saya%20butuh%20bantuan.`, "_blank")}
          />
          <MenuItem
            icon={<Mail className="w-5 h-5" />}
            label="Email Admin"
            sub={CS_EMAIL}
            iconBg="bg-blue-50"
            iconColor="text-blue-500"
            onClick={() => window.open(`mailto:${CS_EMAIL}`, "_blank")}
          />
          <MenuItem
            icon={<AlertCircle className="w-5 h-5" />}
            label="Laporkan Masalah"
            sub="Bug atau keluhan teknis"
            iconBg="bg-red-50"
            iconColor="text-red-500"
            last
            onClick={() => window.open(`https://wa.me/${CS_WA}?text=Halo%20admin%20RUTE%2C%20saya%20ingin%20melaporkan%20masalah%3A%20`, "_blank")}
          />
        </MenuGroup>

        {/* LEGAL */}
        <MenuGroup title="Legal & Info">
          <MenuItem
            icon={<FileText className="w-5 h-5" />}
            label="Syarat & Ketentuan"
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
            onClick={() => setModal("syarat")}
          />
          <MenuItem
            icon={<Shield className="w-5 h-5" />}
            label="Kebijakan Privasi"
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
            onClick={() => setModal("privasi")}
          />
          <MenuItem
            icon={<Info className="w-5 h-5" />}
            label="Versi Aplikasi"
            sub={`RUTE v${APP_VERSION}`}
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
            last
            badge={<span className="text-xs text-muted-foreground font-mono">{APP_VERSION}</span>}
          />
        </MenuGroup>

        {/* KELUAR */}
        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-destructive/30 text-destructive font-semibold text-sm hover:bg-destructive/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {logoutMutation.isPending ? "Keluar..." : "Keluar dari Akun"}
        </button>
      </div>

      <BottomNav active="akun" />

      {cropSrc && (
        <CropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}

      {/* ── MODAL: EDIT PROFIL ── */}
      <ModalSheet open={modal === "editProfil"} onClose={() => setModal(null)} title="Edit Profil">
        <form onSubmit={handleEditProfil} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nama Lengkap</label>
            <input
              className="mt-1.5 w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              value={editForm.nama}
              onChange={(e) => setEditForm((p) => ({ ...p, nama: e.target.value }))}
              placeholder="Nama lengkap"
              required minLength={2}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nomor WhatsApp</label>
            <input
              className="mt-1.5 w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              value={editForm.no_whatsapp}
              onChange={(e) => setEditForm((p) => ({ ...p, no_whatsapp: e.target.value }))}
              placeholder="08xxxxxxxxxx"
              required inputMode="numeric"
            />
          </div>
          {editError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {editError}
            </div>
          )}
          {editOk && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
              <CheckCircle className="w-4 h-4 flex-shrink-0" /> Profil berhasil diperbarui!
            </div>
          )}
          <button
            type="submit"
            disabled={editLoading}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm"
            style={{ backgroundColor: "hsl(var(--accent))" }}
          >
            {editLoading ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </form>
      </ModalSheet>

      {/* ── MODAL: GANTI PASSWORD ── */}
      <ModalSheet open={modal === "gantiPassword"} onClose={() => setModal(null)} title="Ganti Password">
        <form onSubmit={handleChangePassword} className="p-5 space-y-4">
          {(["lama", "baru", "konfirm"] as const).map((key) => {
            const labels = { lama: "Password Lama", baru: "Password Baru", konfirm: "Konfirmasi Password Baru" };
            const fields = { lama: "password_lama", baru: "password_baru", konfirm: "konfirmasi" } as const;
            const autoCompletes = { lama: "current-password", baru: "new-password", konfirm: "new-password" } as const;
            return (
              <div key={key}>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{labels[key]}</label>
                <div className="relative mt-1.5">
                  <input
                    type={showPw[key] ? "text" : "password"}
                    autoComplete={autoCompletes[key]}
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    value={pwForm[fields[key]]}
                    onChange={(e) => setPwForm((p) => ({ ...p, [fields[key]]: e.target.value }))}
                    placeholder={labels[key]}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPw((p) => ({ ...p, [key]: !p[key] }))}
                  >
                    {showPw[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
          {pwError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {pwError}
            </div>
          )}
          {pwOk && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
              <CheckCircle className="w-4 h-4 flex-shrink-0" /> Password berhasil diganti!
            </div>
          )}
          <button
            type="submit"
            disabled={pwLoading}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm"
            style={{ backgroundColor: "hsl(var(--accent))" }}
          >
            {pwLoading ? "Menyimpan..." : "Ganti Password"}
          </button>
        </form>
      </ModalSheet>

      {/* ── MODAL: REKENING ── */}
      <ModalSheet open={modal === "rekening"} onClose={() => setModal(null)} title="Informasi Rekening">
        <form onSubmit={handleSaveRekening} className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">Isi data rekening bank kamu. Admin akan menggunakan info ini untuk mentransfer pendapatan setelah trip selesai.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Nama Bank</label>
              <input
                type="text"
                placeholder="Contoh: BCA, BRI, Mandiri, BNI"
                value={rekeningForm.nama_bank}
                onChange={e => setRekeningForm(f => ({ ...f, nama_bank: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#a85e28]/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Nomor Rekening</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Masukkan nomor rekening"
                value={rekeningForm.no_rekening}
                onChange={e => setRekeningForm(f => ({ ...f, no_rekening: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#a85e28]/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Nama Pemilik Rekening</label>
              <input
                type="text"
                placeholder="Sesuai buku tabungan"
                value={rekeningForm.nama_pemilik_rekening}
                onChange={e => setRekeningForm(f => ({ ...f, nama_pemilik_rekening: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#a85e28]/40"
              />
            </div>
          </div>
          {rekeningError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{rekeningError}</p>
          )}
          {rekeningOk && (
            <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> Informasi rekening berhasil disimpan.
            </p>
          )}
          <button
            type="submit"
            disabled={rekeningLoading}
            className="w-full py-3 rounded-2xl bg-[#a85e28] text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {rekeningLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Simpan Rekening
          </button>
        </form>
      </ModalSheet>

      {/* ── MODAL: RATING & ULASAN ── */}
      <ModalSheet open={modal === "ratingList"} onClose={() => setModal(null)} title="Rating & Ulasan">
        <div className="p-5">
          {ratingSummary && (
            <div className="flex items-center gap-4 p-4 bg-muted/40 rounded-2xl mb-4">
              <div className="text-center">
                <p className="text-4xl font-bold text-foreground">
                  {ratingSummary.avg > 0 ? ratingSummary.avg.toFixed(1) : "-"}
                </p>
                <Stars value={ratingSummary.avg} />
                <p className="text-xs text-muted-foreground mt-1">{ratingSummary.count} ulasan</p>
              </div>
              <div className="flex-1">
                {[5, 4, 3, 2, 1].map((s) => {
                  const cnt = ratings?.filter((r) => r.stars === s).length ?? 0;
                  const pct = ratingSummary.count > 0 ? (cnt / ratingSummary.count) * 100 : 0;
                  return (
                    <div key={s} className="flex items-center gap-2 mb-1">
                      <span className="text-xs w-3">{s}</span>
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right">{cnt}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!ratings ? (
            <p className="text-center text-sm text-muted-foreground py-8">Memuat ulasan...</p>
          ) : ratings.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Belum ada ulasan dari penumpang.</p>
          ) : (
            <div className="space-y-3">
              {ratings.map((r) => (
                <div key={r.id} className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-accent" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">{r.rater_nama}</span>
                    </div>
                    <Stars value={r.stars} />
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground italic">"{r.comment}"</p>}
                  <p className="text-[10px] text-muted-foreground/60 mt-2">
                    {new Date(r.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalSheet>

      {/* ── MODAL: FAQ ── */}
      <ModalSheet open={modal === "faq"} onClose={() => setModal(null)} title="FAQ">
        <div className="p-5 space-y-3">
          {(isDriver ? FAQ_MITRA : FAQ_PENUMPANG).map((item, i) => (
            <div key={i} className="bg-card rounded-xl border border-border overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="text-sm font-semibold text-foreground pr-2">{item.q}</span>
                {openFaq === i ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </ModalSheet>

      {/* ── MODAL: SYARAT & KETENTUAN ── */}
      <ModalSheet open={modal === "syarat"} onClose={() => setModal(null)} title="Syarat & Ketentuan">
        <div className="p-5 space-y-5 text-sm text-muted-foreground leading-relaxed">
          <div>
            <p className="font-bold text-foreground text-base">
              {isDriver ? "Syarat & Ketentuan Mitra Driver RUTE" : "Syarat & Ketentuan Pengguna RUTE"}
            </p>
            <p className="text-xs mt-1">Harap baca ketentuan ini dengan saksama sebelum menggunakan layanan RUTE. Dengan mendaftar dan menggunakan aplikasi, Anda dianggap telah membaca, memahami, dan menyetujui seluruh ketentuan berikut.</p>
          </div>

          {isDriver ? (
            <>
              <div>
                <p className="font-semibold text-foreground mb-1">A. KETENTUAN UMUM MITRA</p>
                <p className="mb-2"><strong className="text-foreground">1. Persyaratan Pendaftaran.</strong> Calon mitra wajib berusia minimal 21 tahun, memiliki SIM A atau SIM B1 yang masih berlaku, STNK aktif atas nama sendiri atau keluarga inti, dan nomor WhatsApp aktif yang dapat dihubungi. Kendaraan yang didaftarkan harus berusia maksimal 10 tahun dari tahun produksi dan dalam kondisi layak jalan secara teknis.</p>
                <p className="mb-2"><strong className="text-foreground">2. Verifikasi & Aktivasi Akun.</strong> Setelah pendaftaran, akun mitra akan diverifikasi oleh tim RUTE dalam 1–3 hari kerja. RUTE berhak menolak pendaftaran tanpa menyebutkan alasan. Mitra yang lolos verifikasi akan mendapatkan notifikasi aktivasi melalui aplikasi.</p>
                <p><strong className="text-foreground">3. Data Kendaraan.</strong> Foto kendaraan yang diunggah harus sesuai dengan kendaraan yang benar-benar digunakan saat beroperasi. Penggunaan foto kendaraan lain atau manipulasi data kendaraan merupakan pelanggaran berat dan dapat mengakibatkan pemblokiran permanen.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">B. KEWAJIBAN OPERASIONAL</p>
                <p className="mb-2"><strong className="text-foreground">4. Kewajiban Saat Bertugas.</strong> Mitra wajib menjemput penumpang di titik yang tertera di aplikasi, tidak menaikkan penumpang tambahan di luar yang terdaftar di sistem, dan memperbarui status perjalanan secara real-time (berangkat, sudah jemput, dalam perjalanan, selesai). Pembaruan status yang tidak dilakukan dapat memengaruhi kepercayaan penumpang dan penilaian akun mitra.</p>
                <p className="mb-2"><strong className="text-foreground">5. Konfirmasi Pesanan.</strong> Mitra wajib mengkonfirmasi atau menolak pesanan masuk dalam waktu 2 jam sejak notifikasi diterima. Pesanan yang tidak ditanggapi melewati batas waktu tersebut dapat dibatalkan otomatis oleh sistem dan dicatat sebagai "tidak merespons" yang memengaruhi performa akun.</p>
                <p className="mb-2"><strong className="text-foreground">6. Lokasi & GPS.</strong> Mitra wajib mengizinkan akses lokasi (GPS) saat beroperasi aktif. Data lokasi digunakan untuk memperbarui posisi real-time kepada penumpang selama perjalanan berlangsung. Tanpa izin GPS, fitur pemantauan lokasi penumpang tidak akan berfungsi.</p>
                <p><strong className="text-foreground">7. Layanan Carter & Tebengan.</strong> Mitra yang menawarkan layanan carter bertanggung jawab memastikan kesiapan kendaraan dan ketersediaan pada tanggal dan jam yang disepakati. Mitra yang membuka Tebengan Pulang wajib memastikan kursi yang ditawarkan benar-benar tersedia dan tidak melebihi kapasitas kendaraan.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">C. HARGA, PEMBAYARAN & PENGHASILAN</p>
                <p className="mb-2"><strong className="text-foreground">8. Penetapan Harga.</strong> Mitra berhak menetapkan harga perjalanan secara mandiri. Namun, harga yang sudah dikonfirmasi oleh penumpang tidak boleh diubah secara sepihak. Perubahan harga mendadak setelah booking dikonfirmasi dapat dikenai sanksi berupa penangguhan akun.</p>
                <p><strong className="text-foreground">9. Mekanisme Pembayaran.</strong> Pembayaran antara penumpang dan mitra dilakukan secara langsung (QRIS, transfer bank, atau tunai sesuai kesepakatan). RUTE tidak memungut komisi dari setiap perjalanan pada tahap ini. Rekap penghasilan dan riwayat perjalanan dapat dipantau di menu Akun.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">D. PERILAKU, KESELAMATAN & SANKSI</p>
                <p className="mb-2"><strong className="text-foreground">10. Standar Perilaku.</strong> Mitra wajib bersikap sopan dan profesional kepada penumpang. Dilarang mengemudi dalam kondisi mengantuk, sakit, atau di bawah pengaruh alkohol dan obat-obatan. Mitra wajib mematuhi seluruh peraturan lalu lintas yang berlaku selama beroperasi.</p>
                <p className="mb-2"><strong className="text-foreground">11. Keselamatan Kendaraan.</strong> Mitra bertanggung jawab penuh atas kondisi dan kelaikan kendaraan, termasuk rem, ban, lampu, dan fitur keselamatan lainnya. Penumpang berhak menolak perjalanan jika merasa kondisi kendaraan tidak aman, dan penolakan tersebut tidak dapat dikenakan sanksi kepada penumpang.</p>
                <p className="mb-2"><strong className="text-foreground">12. Rating & Evaluasi.</strong> Penumpang dapat memberikan rating 1–5 bintang beserta ulasan setelah perjalanan selesai. Mitra dengan rata-rata rating di bawah 3,0 selama 30 hari berturut-turut akan masuk masa evaluasi. Jika tidak ada perbaikan, akun dapat ditangguhkan hingga proses evaluasi selesai.</p>
                <p className="mb-2"><strong className="text-foreground">13. Larangan Keras.</strong> Dilarang: (a) meminta atau membagikan nomor kontak pribadi kepada penumpang di luar fitur chat aplikasi; (b) melakukan tindakan diskriminasi berdasarkan suku, agama, ras, atau gender; (c) melakukan kekerasan verbal maupun fisik terhadap penumpang; (d) menggunakan data penumpang untuk keperluan di luar perjalanan. Pelanggaran poin ini berakibat pemblokiran akun permanen.</p>
                <p><strong className="text-foreground">14. Penanganan Keluhan.</strong> Keluhan dari penumpang akan ditindaklanjuti oleh tim RUTE dalam 2 hari kerja. Mitra diberi kesempatan untuk memberikan klarifikasi. Keputusan RUTE bersifat final dan mengikat untuk penyelesaian sengketa yang melibatkan kedua pihak.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">E. KETENTUAN LAINNYA</p>
                <p className="mb-2"><strong className="text-foreground">15. Force Majeure.</strong> Mitra tidak dapat dikenai sanksi apabila tidak dapat memenuhi kewajiban akibat kejadian di luar kendali wajar, seperti bencana alam, kerusuhan, pemblokiran jalan oleh pihak berwenang, atau kondisi darurat yang dapat dibuktikan. Mitra wajib segera menginformasikan kondisi tersebut kepada penumpang dan admin RUTE.</p>
                <p className="mb-2"><strong className="text-foreground">16. Hukum yang Berlaku.</strong> Syarat & Ketentuan ini tunduk pada hukum Republik Indonesia. Segala sengketa yang tidak dapat diselesaikan secara musyawarah akan diselesaikan melalui jalur hukum yang berlaku di wilayah Kalimantan Timur.</p>
                <p><strong className="text-foreground">17. Perubahan Ketentuan.</strong> RUTE berhak mengubah ketentuan ini kapan saja dengan memberikan pemberitahuan minimal 7 hari sebelumnya melalui notifikasi aplikasi atau pengumuman di halaman Akun. Melanjutkan penggunaan layanan setelah pemberitahuan dianggap sebagai persetujuan atas perubahan tersebut.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="font-semibold text-foreground mb-1">A. PENDAFTARAN & AKUN</p>
                <p className="mb-2"><strong className="text-foreground">1. Persyaratan Pengguna.</strong> Pengguna wajib berusia minimal 17 tahun atau mendapatkan persetujuan dari orang tua/wali. Pengguna wajib mendaftar menggunakan data yang benar, lengkap, dan dapat diverifikasi. Akun yang dibuat dengan data palsu atau identitas orang lain akan ditangguhkan tanpa pemberitahuan sebelumnya.</p>
                <p className="mb-2"><strong className="text-foreground">2. Satu Akun per Pengguna.</strong> Satu nomor WhatsApp hanya dapat digunakan untuk satu akun aktif. Pembuatan lebih dari satu akun oleh pengguna yang sama, baik menggunakan identitas berbeda maupun nomor berbeda, merupakan pelanggaran dan dapat berakibat pemblokiran seluruh akun terkait.</p>
                <p><strong className="text-foreground">3. Keamanan Akun.</strong> Pengguna bertanggung jawab penuh atas kerahasiaan password dan keamanan akun mereka. Segala aktivitas yang terjadi melalui akun dianggap dilakukan oleh pemilik akun. Jika akun diakses tanpa izin, segera hubungi CS RUTE untuk pemblokiran darurat.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">B. PEMESANAN & PEMBAYARAN</p>
                <p className="mb-2"><strong className="text-foreground">4. Proses Pemesanan.</strong> Penumpang bertanggung jawab penuh atas keakuratan seluruh data yang dimasukkan saat booking, termasuk titik jemput, titik antar, jumlah kursi, dan tanggal perjalanan. Kesalahan data yang menyebabkan kerugian operasional menjadi tanggung jawab penumpang.</p>
                <p className="mb-2"><strong className="text-foreground">5. Konfirmasi Pembayaran.</strong> Setelah booking berhasil dibuat, penumpang wajib melakukan pembayaran dan mengunggah bukti pembayaran dalam waktu 24 jam. Booking yang belum dikonfirmasi pembayarannya dalam batas waktu tersebut dapat dibatalkan otomatis oleh sistem. Metode pembayaran yang tersedia: QRIS, transfer bank BRI/BNI/Mandiri, dan dompet digital (sesuai yang ditentukan mitra).</p>
                <p className="mb-2"><strong className="text-foreground">6. Konfirmasi Mitra.</strong> Booking dianggap terkonfirmasi setelah mitra menyetujui pesanan. RUTE tidak menjamin setiap pesanan akan diterima oleh mitra. Dalam hal mitra menolak atau tidak merespons, penumpang akan mendapat pemberitahuan dan dapat mencari jadwal alternatif.</p>
                <p><strong className="text-foreground">7. Layanan Carter & Tebengan.</strong> Untuk layanan Carter, penumpang menyewa kendaraan secara penuh dengan waktu dan rute yang dapat dikustomisasi sesuai kesepakatan dengan mitra. Untuk Tebengan Pulang, penumpang berbagi kendaraan dengan mitra yang sedang dalam perjalanan pulang; harga cenderung lebih terjangkau namun jadwal mengikuti ketersediaan mitra.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">C. PEMBATALAN & PENGEMBALIAN DANA</p>
                <p className="mb-2"><strong className="text-foreground">8. Kebijakan Pembatalan.</strong> Pembatalan hanya dapat dilakukan melalui aplikasi dan minimal 24 jam sebelum jam keberangkatan yang tertera. Pembatalan yang dilakukan kurang dari 24 jam sebelum keberangkatan tidak dapat diproses melalui aplikasi; penumpang disarankan menghubungi mitra dan CS RUTE secara langsung.</p>
                <p className="mb-2"><strong className="text-foreground">9. Pengembalian Dana.</strong> Pengembalian dana untuk pembatalan yang memenuhi syarat diproses oleh admin RUTE dalam waktu 1–3 hari kerja. Besaran pengembalian dana tergantung pada kebijakan mitra dan waktu pembatalan. Biaya transfer atau biaya administrasi bank dapat dipotong dari jumlah pengembalian.</p>
                <p><strong className="text-foreground">10. Pembatalan oleh Mitra.</strong> Jika mitra membatalkan perjalanan, penumpang berhak mendapatkan pengembalian dana penuh. Admin RUTE akan membantu proses pengembalian dan membantu penumpang menemukan mitra pengganti jika tersedia.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">D. KEWAJIBAN & PERILAKU PENUMPANG</p>
                <p className="mb-2"><strong className="text-foreground">11. Ketepatan Waktu.</strong> Penumpang wajib berada di titik jemput yang telah disepakati maksimal 10 menit setelah jam keberangkatan. Keterlambatan yang melampaui batas ini dapat menyebabkan jemputan dibatalkan oleh mitra. Penumpang tidak berhak atas pengembalian dana jika jemputan gagal akibat keterlambatan sendiri.</p>
                <p className="mb-2"><strong className="text-foreground">12. Barang Bawaan.</strong> Penumpang bertanggung jawab sepenuhnya atas barang bawaan pribadi selama perjalanan. Dilarang membawa: senjata tajam, bahan peledak, bahan mudah terbakar, narkotika dan zat terlarang, hewan tanpa kandang yang layak, atau barang-barang lain yang dilarang oleh peraturan perundang-undangan yang berlaku.</p>
                <p className="mb-2"><strong className="text-foreground">13. Perilaku Selama Perjalanan.</strong> Penumpang wajib bersikap sopan dan menghormati mitra driver selama perjalanan. Penumpang dilarang mengganggu konsentrasi pengemudi, meminta perubahan rute secara mendadak yang tidak wajar, atau melakukan tindakan yang membahayakan keselamatan perjalanan. Pelanggaran dapat berakibat pada penghentian perjalanan di tempat.</p>
                <p><strong className="text-foreground">14. Penggunaan Fitur Chat.</strong> Fitur chat dalam aplikasi hanya digunakan untuk komunikasi terkait perjalanan. Dilarang: membagikan nomor kontak pribadi, mengirim konten berbau SARA, mengirim materi pornografi, melakukan ancaman atau intimidasi kepada mitra, serta menggunakan fitur chat untuk keperluan komersial yang tidak berkaitan dengan layanan RUTE.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">E. TANGGUNG JAWAB & KETENTUAN LAINNYA</p>
                <p className="mb-2"><strong className="text-foreground">15. Batasan Tanggung Jawab RUTE.</strong> RUTE berperan sebagai platform teknologi yang menghubungkan penumpang dengan mitra driver independen. RUTE tidak bertanggung jawab atas: keterlambatan perjalanan akibat kondisi lalu lintas atau cuaca; kerusakan atau kehilangan barang bawaan; cedera atau kecelakaan yang terjadi selama perjalanan; atau tindakan mitra yang berada di luar kendali platform. Pengguna disarankan untuk memiliki asuransi perjalanan pribadi.</p>
                <p className="mb-2"><strong className="text-foreground">16. Rating & Ulasan.</strong> Penumpang dapat memberikan rating 1–5 bintang dan ulasan tertulis setelah perjalanan selesai. Rating dan ulasan harus jujur dan mencerminkan pengalaman nyata. Pemberian rating atau ulasan palsu, fitnah, atau yang bersifat memeras merupakan pelanggaran dan dapat berakibat pemblokiran akun.</p>
                <p className="mb-2"><strong className="text-foreground">17. Force Majeure.</strong> RUTE dan mitra tidak dapat dimintai tanggung jawab atas kegagalan memenuhi kewajiban akibat kejadian di luar kendali wajar, seperti bencana alam, keadaan darurat nasional, pemblokiran jalan oleh otoritas, atau gangguan infrastruktur besar. Dalam kondisi tersebut, RUTE akan berupaya menginformasikan situasi kepada pengguna sesegera mungkin.</p>
                <p className="mb-2"><strong className="text-foreground">18. Hukum yang Berlaku.</strong> Syarat & Ketentuan ini tunduk pada hukum Republik Indonesia. Segala perselisihan yang tidak dapat diselesaikan secara musyawarah mufakat akan diselesaikan melalui mekanisme hukum yang berlaku di wilayah Kalimantan Timur.</p>
                <p><strong className="text-foreground">19. Perubahan Ketentuan.</strong> RUTE berhak memperbarui atau mengubah Syarat & Ketentuan ini kapan saja. Pemberitahuan perubahan akan dikirimkan minimal 7 hari sebelum berlaku melalui notifikasi aplikasi. Melanjutkan penggunaan layanan setelah pemberitahuan dianggap sebagai persetujuan atas perubahan tersebut.</p>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground/50 pt-2 border-t border-border">Berlaku sejak 1 Januari 2025 · Diperbarui April 2025 · RUTE Kalimantan Timur</p>
        </div>
      </ModalSheet>

      {/* ── MODAL: KEBIJAKAN PRIVASI ── */}
      <ModalSheet open={modal === "privasi"} onClose={() => setModal(null)} title="Kebijakan Privasi">
        <div className="p-5 space-y-5 text-sm text-muted-foreground leading-relaxed">
          <div>
            <p className="font-bold text-foreground text-base">
              {isDriver ? "Kebijakan Privasi Mitra Driver RUTE" : "Kebijakan Privasi Pengguna RUTE"}
            </p>
            <p className="text-xs mt-1">RUTE berkomitmen untuk melindungi privasi dan keamanan data pribadi Anda. Kebijakan ini menjelaskan data apa yang kami kumpulkan, bagaimana kami menggunakannya, dan hak-hak Anda sebagai pengguna.</p>
          </div>

          {isDriver ? (
            <>
              <div>
                <p className="font-semibold text-foreground mb-1">A. DATA YANG KAMI KUMPULKAN</p>
                <p className="mb-2"><strong className="text-foreground">1. Data Identitas & Akun.</strong> Nama lengkap, nomor WhatsApp aktif, dan password (disimpan dalam bentuk terenkripsi). Data ini digunakan sebagai identitas akun dan tidak pernah dibagikan secara langsung kepada penumpang tanpa izin Anda.</p>
                <p className="mb-2"><strong className="text-foreground">2. Data Kendaraan.</strong> Jenis kendaraan, merek, model, tahun produksi, warna, nomor plat, dan foto kendaraan. Data ini ditampilkan kepada penumpang untuk membantu mereka mengenali kendaraan saat penjemputan.</p>
                <p className="mb-2"><strong className="text-foreground">3. Data Operasional.</strong> Riwayat perjalanan (jadwal tetap, carter, tebengan), status perjalanan real-time, rekap penghasilan per periode, dan catatan pembatalan atau keluhan yang masuk.</p>
                <p className="mb-2"><strong className="text-foreground">4. Data Lokasi (GPS).</strong> Posisi GPS real-time dikumpulkan selama Anda aktif beroperasi dan terdapat perjalanan aktif. Data lokasi dibagikan kepada penumpang yang sedang dalam perjalanan bersama Anda untuk keperluan pemantauan. Setelah perjalanan selesai, pembaruan lokasi dihentikan secara otomatis.</p>
                <p><strong className="text-foreground">5. Data Rating & Performa.</strong> Nilai rating rata-rata, jumlah ulasan yang diterima, dan catatan performa seperti rasio konfirmasi pesanan dan tingkat pembatalan. Data ini digunakan untuk menilai kualitas layanan dan dapat mempengaruhi visibilitas akun di platform.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">B. PENGGUNAAN DATA</p>
                <p className="mb-2"><strong className="text-foreground">6. Untuk Operasional Layanan.</strong> Data digunakan untuk memproses dan menampilkan jadwal Anda kepada calon penumpang, mengelola konfirmasi booking, dan memperbarui status perjalanan secara real-time di sisi penumpang.</p>
                <p className="mb-2"><strong className="text-foreground">7. Untuk Peningkatan Platform.</strong> RUTE menganalisis pola penggunaan secara agregat dan anonim untuk meningkatkan fitur aplikasi, mengoptimalkan rute, dan meningkatkan kualitas layanan secara keseluruhan. Analisis ini tidak mengidentifikasi Anda secara pribadi.</p>
                <p><strong className="text-foreground">8. Notifikasi & Komunikasi.</strong> Kami mengirim notifikasi push terkait pesanan masuk, konfirmasi pembayaran, pembaruan sistem, dan informasi penting lainnya. Anda dapat mengelola preferensi notifikasi melalui pengaturan perangkat.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">C. BERBAGI DATA</p>
                <p className="mb-2"><strong className="text-foreground">9. Data yang Terlihat oleh Penumpang.</strong> Penumpang yang melakukan booking hanya dapat melihat: nama mitra, foto profil (jika ada), jenis kendaraan, warna, nomor plat, dan rating rata-rata. Nomor WhatsApp asli Anda tidak ditampilkan secara langsung kepada penumpang — komunikasi dilakukan melalui fitur chat terenkripsi di dalam aplikasi.</p>
                <p className="mb-2"><strong className="text-foreground">10. Data yang Dibagikan kepada Pihak Ketiga.</strong> RUTE tidak menjual, menyewakan, atau menukar data pribadi mitra kepada pihak ketiga untuk keperluan komersial. Data hanya dapat dibagikan kepada: (a) penyedia layanan teknis yang membantu operasional platform (dengan perjanjian kerahasiaan); (b) otoritas hukum jika diwajibkan oleh peraturan perundang-undangan yang berlaku.</p>
                <p><strong className="text-foreground">11. Data Lokasi & Penumpang.</strong> Data lokasi GPS Anda hanya dibagikan kepada penumpang yang sedang aktif dalam perjalanan bersama Anda. Data lokasi tidak disimpan secara permanen setelah perjalanan selesai — hanya timestamp terakhir yang disimpan untuk keperluan log sistem.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">D. KEAMANAN & HAK ANDA</p>
                <p className="mb-2"><strong className="text-foreground">12. Keamanan Data.</strong> Password disimpan menggunakan enkripsi bcrypt satu arah — kami tidak dapat membaca password Anda. Seluruh komunikasi antara aplikasi dan server dilindungi dengan enkripsi HTTPS/TLS. Akses ke database dibatasi hanya untuk sistem dan personel yang berwenang dengan autentikasi berlapis.</p>
                <p className="mb-2"><strong className="text-foreground">13. Retensi Data.</strong> Data akun aktif disimpan selama akun masih digunakan. Jika akun tidak aktif selama 12 bulan berturut-turut, RUTE berhak mengirimkan pemberitahuan dan menghapus akun jika tidak ada respons. Setelah permintaan penghapusan akun, data pribadi akan dihapus atau dianonimkan dalam waktu 30 hari, kecuali data yang wajib dipertahankan untuk keperluan hukum, audit, atau penyelesaian sengketa yang sedang berjalan.</p>
                <p className="mb-2"><strong className="text-foreground">14. Hak Akses & Koreksi.</strong> Anda berhak mengakses seluruh data pribadi yang kami simpan tentang Anda, meminta koreksi atas data yang tidak akurat atau tidak lengkap, serta meminta rincian tentang bagaimana data Anda digunakan. Hubungi CS kami melalui WhatsApp untuk mengajukan permintaan tersebut.</p>
                <p className="mb-2"><strong className="text-foreground">15. Hak Penghapusan Data.</strong> Anda berhak meminta penghapusan akun dan seluruh data pribadi Anda kapan saja. Permintaan akan diproses dalam 30 hari kerja. Catatan: data yang terkait dengan sengketa atau klaim yang belum diselesaikan mungkin ditahan hingga penyelesaian tuntas.</p>
                <p><strong className="text-foreground">16. Perubahan Kebijakan.</strong> RUTE dapat memperbarui Kebijakan Privasi ini secara berkala. Pemberitahuan akan dikirimkan melalui notifikasi aplikasi minimal 7 hari sebelum perubahan berlaku. Melanjutkan penggunaan layanan setelah pemberitahuan dianggap sebagai persetujuan atas perubahan kebijakan.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="font-semibold text-foreground mb-1">A. DATA YANG KAMI KUMPULKAN</p>
                <p className="mb-2"><strong className="text-foreground">1. Data Identitas & Akun.</strong> Nama lengkap, nomor WhatsApp aktif yang digunakan untuk pendaftaran, dan password (disimpan dalam bentuk terenkripsi satu arah). Data identitas ini digunakan untuk verifikasi akun dan tidak pernah dibagikan langsung kepada mitra driver.</p>
                <p className="mb-2"><strong className="text-foreground">2. Data Perjalanan.</strong> Titik jemput dan titik antar setiap perjalanan (berupa koordinat GPS dan nama lokasi), tanggal dan jam keberangkatan, jumlah kursi yang dipesan, jenis layanan yang digunakan (jadwal tetap, carter, tebengan), serta status perjalanan dari waktu ke waktu.</p>
                <p className="mb-2"><strong className="text-foreground">3. Data Pembayaran.</strong> Foto bukti pembayaran yang diunggah setelah booking. RUTE tidak menyimpan informasi rekening bank, nomor kartu kredit, atau data finansial sensitif lainnya — pembayaran dilakukan langsung antara penumpang dan mitra.</p>
                <p className="mb-2"><strong className="text-foreground">4. Data Perangkat & Teknis.</strong> Tipe perangkat, sistem operasi, token notifikasi push (untuk pengiriman notifikasi perjalanan), dan alamat IP saat login. Data ini digunakan untuk memastikan pengalaman aplikasi yang optimal dan keamanan akun.</p>
                <p><strong className="text-foreground">5. Data Interaksi.</strong> Riwayat chat dengan mitra dalam konteks perjalanan, rating dan ulasan yang Anda berikan kepada mitra, serta catatan keluhan atau laporan yang Anda ajukan kepada tim RUTE.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">B. PENGGUNAAN DATA</p>
                <p className="mb-2"><strong className="text-foreground">6. Untuk Operasional Layanan.</strong> Data digunakan untuk memproses dan mengkonfirmasi pemesanan, menampilkan informasi perjalanan kepada mitra yang relevan, memfasilitasi komunikasi antara penumpang dan mitra melalui fitur chat, serta menampilkan riwayat perjalanan di halaman Pesanan Anda.</p>
                <p className="mb-2"><strong className="text-foreground">7. Untuk Notifikasi Perjalanan.</strong> Kami mengirimkan notifikasi push terkait: konfirmasi booking oleh mitra, pembaruan status perjalanan (mitra berangkat, sudah dijemput, perjalanan selesai), pengingat jadwal keberangkatan, dan informasi sistem penting lainnya. Anda dapat menonaktifkan notifikasi melalui pengaturan perangkat, namun hal ini dapat memengaruhi pengalaman penggunaan.</p>
                <p className="mb-2"><strong className="text-foreground">8. Untuk Keamanan & Pencegahan Penipuan.</strong> Data dianalisis untuk mendeteksi aktivitas mencurigakan seperti pembuatan akun massal, upaya pembayaran palsu, atau pola penggunaan yang tidak wajar. Langkah ini bertujuan melindungi seluruh pengguna platform.</p>
                <p><strong className="text-foreground">9. Untuk Peningkatan Layanan.</strong> RUTE menganalisis pola penggunaan secara agregat dan anonim — bukan per individu — untuk memperbaiki fitur aplikasi, meningkatkan pengalaman pengguna, dan mengembangkan layanan baru. Data Anda tidak diidentifikasi secara pribadi dalam proses ini.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">C. BERBAGI DATA</p>
                <p className="mb-2"><strong className="text-foreground">10. Data yang Terlihat oleh Mitra Driver.</strong> Mitra hanya dapat melihat nama Anda dan titik jemput/antar untuk keperluan operasional perjalanan. Nomor WhatsApp Anda tidak ditampilkan kepada mitra — komunikasi dilakukan melalui fitur chat terenkripsi di aplikasi. Mitra tidak dapat mengakses foto bukti pembayaran Anda.</p>
                <p className="mb-2"><strong className="text-foreground">11. Data yang Dibagikan kepada Pihak Ketiga.</strong> RUTE tidak menjual, menyewakan, atau mempertukarkan data pribadi Anda kepada pihak ketiga untuk tujuan komersial. Data dapat dibagikan kepada: (a) penyedia layanan infrastruktur teknis (server, notifikasi) yang terikat perjanjian kerahasiaan; (b) otoritas hukum jika diwajibkan oleh peraturan yang berlaku. Kami tidak menggunakan data Anda untuk iklan bertarget dari pihak ketiga.</p>
                <p><strong className="text-foreground">12. Transfer Data.</strong> Data Anda disimpan di server yang berlokasi di wilayah yang memiliki standar perlindungan data yang memadai. Jika ada transfer data lintas wilayah, kami memastikan perlindungan yang setara diterapkan sesuai ketentuan yang berlaku.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">D. KEAMANAN & HAK ANDA</p>
                <p className="mb-2"><strong className="text-foreground">13. Keamanan Data.</strong> Password Anda disimpan menggunakan enkripsi bcrypt — kami tidak dapat membaca password Anda. Token sesi login disimpan secara lokal di perangkat Anda dan tidak dikirim ke pihak ketiga. Seluruh komunikasi data dilindungi dengan enkripsi HTTPS/TLS. Tim RUTE tidak akan pernah meminta password Anda melalui chat atau media apapun.</p>
                <p className="mb-2"><strong className="text-foreground">14. Retensi Data.</strong> Data akun dan riwayat perjalanan disimpan selama akun Anda aktif. Akun yang tidak aktif lebih dari 12 bulan akan mendapat pemberitahuan sebelum penghapusan. Setelah Anda meminta penghapusan akun, data pribadi akan dihapus atau dianonimkan dalam 30 hari kerja, kecuali data yang harus dipertahankan untuk keperluan hukum.</p>
                <p className="mb-2"><strong className="text-foreground">15. Hak Akses & Koreksi.</strong> Anda berhak mengetahui data apa saja yang kami simpan tentang Anda dan meminta koreksi atas data yang tidak akurat. Sebagian besar data dapat diperbarui langsung melalui halaman Profil di aplikasi. Untuk data yang tidak dapat diubah sendiri, hubungi CS kami via WhatsApp.</p>
                <p className="mb-2"><strong className="text-foreground">16. Hak Penghapusan Data.</strong> Anda berhak meminta penghapusan akun dan seluruh data pribadi Anda kapan saja. Permintaan akan diproses dalam 30 hari kerja. Perjalanan yang sedang aktif atau sengketa yang belum selesai dapat menunda proses penghapusan hingga penyelesaian tuntas.</p>
                <p className="mb-2"><strong className="text-foreground">17. Hak Portabilitas.</strong> Anda berhak meminta salinan data Anda dalam format yang dapat dibaca mesin (JSON/CSV). Ajukan permintaan melalui CS kami dan kami akan menyiapkan ekspor data dalam 7 hari kerja.</p>
                <p><strong className="text-foreground">18. Perubahan Kebijakan.</strong> RUTE dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu untuk mencerminkan perubahan layanan atau regulasi yang berlaku. Pemberitahuan akan dikirimkan melalui notifikasi aplikasi minimal 7 hari sebelum perubahan efektif. Anda selalu dapat membaca versi terbaru kebijakan ini di halaman Akun.</p>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-1">E. KONTAK</p>
                <p><strong className="text-foreground">19. Hubungi Kami.</strong> Untuk pertanyaan, permintaan akses data, koreksi, atau penghapusan data, hubungi tim RUTE melalui fitur CS di aplikasi atau WhatsApp resmi kami. Kami berkomitmen merespons setiap permintaan dalam 2 hari kerja.</p>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground/50 pt-2 border-t border-border">Berlaku sejak 1 Januari 2025 · Diperbarui April 2025 · RUTE Kalimantan Timur</p>
        </div>
      </ModalSheet>
    </div>
  );
}
