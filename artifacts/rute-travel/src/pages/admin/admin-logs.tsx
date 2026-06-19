import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, RefreshCw } from "lucide-react";

interface Log {
  id: number; admin_id: number; admin_nama: string; aksi: string; detail: string | null; created_at: string;
}

const AKSI_COLOR: Record<string, string> = {
  DELETE_USER: "bg-red-100 text-red-700", DELETE_SCHEDULE: "bg-red-100 text-red-700",
  CANCEL_BOOKING: "bg-orange-100 text-orange-700", CANCEL_CARTER: "bg-orange-100 text-orange-700",
  CONFIRM_PAYMENT: "bg-green-100 text-green-700", CONFIRM_CARTER_PAYMENT: "bg-green-100 text-green-700",
  REJECT_PAYMENT: "bg-red-100 text-red-700", REJECT_CARTER_PAYMENT: "bg-red-100 text-red-700",
  ADD_KOTA: "bg-blue-100 text-blue-700", DELETE_KOTA: "bg-red-100 text-red-700",
  ADD_HARGA: "bg-blue-100 text-blue-700", UPDATE_HARGA: "bg-amber-100 text-amber-700", DELETE_HARGA: "bg-red-100 text-red-700",
  SEND_PENGUMUMAN: "bg-violet-100 text-violet-700", DELETE_PENGUMUMAN: "bg-red-100 text-red-700",
  UPDATE_USER: "bg-amber-100 text-amber-700",
};

export default function AdminLogs() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/logs`, { headers: { Authorization: `Bearer ${token}` } });
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
          <h1 className="text-2xl font-bold text-[#1a1208]">Log Aktivitas Admin</h1>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-border bg-white rounded-xl text-sm hover:bg-[#f5f0e8]">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Belum ada log aktivitas.</div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {rows.map(log => (
                <div key={log.id} className="px-4 py-3 flex items-start gap-3 hover:bg-[#f5f0e8]/50">
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${AKSI_COLOR[log.aksi] ?? "bg-gray-100 text-gray-600"}`}>
                        {log.aksi}
                      </span>
                      <span className="text-xs font-medium text-[#1a1208]">{log.admin_nama}</span>
                    </div>
                    {log.detail && <div className="text-xs text-muted-foreground">{log.detail}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(log.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
