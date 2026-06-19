import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2 } from "lucide-react";

interface Kendaraan {
  id: number; merek: string; model: string; plat_nomor: string; warna: string;
  kapasitas: number; created_at: string;
  driver: { id: number; nama: string } | null;
}

export default function AdminKendaraan() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Kendaraan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/kendaraan`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1208]">Manajemen Kendaraan</h1>
          <span className="text-sm text-muted-foreground">{rows.length} kendaraan</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Belum ada kendaraan terdaftar.</div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f0e8]">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Kendaraan</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Plat Nomor</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Warna</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Kapasitas</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Driver</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs">Terdaftar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(k => (
                    <tr key={k.id} className="hover:bg-[#f5f0e8]/50">
                      <td className="px-4 py-3 font-medium">{k.merek} {k.model}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-[#f5f0e8] px-2 py-1 rounded">{k.plat_nomor}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{k.warna}</td>
                      <td className="px-4 py-3">{k.kapasitas} kursi</td>
                      <td className="px-4 py-3">{k.driver?.nama ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(k.created_at).toLocaleDateString("id-ID")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
