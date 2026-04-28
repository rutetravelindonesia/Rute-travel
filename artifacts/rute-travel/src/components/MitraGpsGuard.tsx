import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { MapPin, LocateFixed, AlertTriangle } from "lucide-react";

export function MitraGpsGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isMitra = user?.role === "driver";

  const [permission, setPermission] = useState<"checking" | "granted" | "denied" | "prompt">("checking");

  useEffect(() => {
    if (!isMitra) return;
    if (!navigator.geolocation) { setPermission("denied"); return; }

    navigator.permissions?.query({ name: "geolocation" as PermissionName })
      .then((result) => {
        setPermission(result.state as "granted" | "denied" | "prompt");
        result.onchange = () => setPermission(result.state as "granted" | "denied" | "prompt");
        if (result.state === "prompt") {
          navigator.geolocation.getCurrentPosition(
            () => setPermission("granted"),
            () => setPermission("denied"),
            { enableHighAccuracy: true },
          );
        }
      })
      .catch(() => {
        navigator.geolocation.getCurrentPosition(
          () => setPermission("granted"),
          () => setPermission("denied"),
          { enableHighAccuracy: true },
        );
      });
  }, [isMitra]);

  function handleRequest() {
    navigator.geolocation.getCurrentPosition(
      () => setPermission("granted"),
      () => setPermission("denied"),
      { enableHighAccuracy: true },
    );
  }

  if (!isMitra || permission === "granted") return <>{children}</>;

  if (permission === "checking") return (
    <div className="min-h-screen bg-[#fdf8f3] flex flex-col items-center justify-center px-6 gap-4">
      <LocateFixed className="w-10 h-10 text-amber-500 animate-pulse" />
      <p className="text-sm text-muted-foreground">Memeriksa izin GPS…</p>
    </div>
  );

  if (permission === "denied") return (
    <div className="min-h-screen bg-[#fdf8f3] flex flex-col items-center justify-center px-6 text-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-foreground">GPS Wajib Diaktifkan</h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
          Sebagai mitra, GPS harus aktif agar penumpang bisa melacak posisi Anda secara langsung.
        </p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left max-w-xs w-full">
        <p className="text-xs font-semibold text-amber-800 mb-2">Cara mengaktifkan:</p>
        <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
          <li>Buka pengaturan browser di perangkat Anda</li>
          <li>Cari izin <strong>Lokasi</strong> untuk situs ini</li>
          <li>Ubah ke <strong>Izinkan</strong></li>
          <li>Muat ulang halaman ini</li>
        </ol>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="w-full max-w-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
      >
        Sudah Diaktifkan — Muat Ulang
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fdf8f3] flex flex-col items-center justify-center px-6 text-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
        <MapPin className="w-8 h-8 text-amber-600" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-foreground">Izin GPS Diperlukan</h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
          Sebagai mitra, GPS harus aktif agar penumpang bisa melacak posisi Anda secara langsung.
        </p>
      </div>
      <button
        onClick={handleRequest}
        className="w-full max-w-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
      >
        <LocateFixed className="w-4 h-4" />
        Izinkan Akses GPS
      </button>
      <p className="text-xs text-muted-foreground max-w-xs">
        Setelah menekan tombol di atas, izinkan lokasi di dialog browser yang muncul.
      </p>
    </div>
  );
}
