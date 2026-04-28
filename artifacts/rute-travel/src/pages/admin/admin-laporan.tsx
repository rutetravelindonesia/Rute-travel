import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Download } from "lucide-react";

interface LaporanItem {
  id: number; total_amount: number; created_at: string; status: string; payment_method: string;
  jenis: "reguler" | "carter";
  user: { nama: string } | null;
  schedule?: { origin_city: string; destination_city: string } | null;
}

interface Laporan {
  periode: { dari: string; sampai: string };
  total_reguler: number;
  total_carter: number;
  total: number;
  bookings: LaporanItem[];
  carter: LaporanItem[];
}

export default function AdminLaporan() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [laporan, setLaporan] = useState<Laporan | null>(null);
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [dari, setDari] = useState(firstOfMonth);
  const [sampai, setSampai] = useState(today);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user]);

  async function load() {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ dari, sampai });
    const r = await fetch(`${apiBase}/admin/laporan?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setLaporan(d);
    setLoading(false);
  }

  function exportCsv() {
    if (!laporan) return;
    const all = [...laporan.bookings, ...laporan.carter];
    const header = "ID,Jenis,Nama,Rute,Total,Metode,Status,Tanggal";
    const body = all.map(b => [
      b.id, b.jenis, b.user?.nama ?? "-",
      b.jenis === "reguler" && b.schedule ? `${b.schedule.origin_city}→${b.schedule.destination_city}` : "Carter",
      b.total_amount, b.payment_method, b.status,
      new Date(b.created_at).toLocaleDateString("id-ID"),
    ].join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `laporan-rute-${dari}-${sampai}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[#1a1208]">Laporan Keuangan</h1>

        <div className="bg-white rounded-xl border border-border p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Dari Tanggal</label>
            <input type="date" value={dari} onChange={e => setDari(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm bg-[#f5f0e8] focus:outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Sampai Tanggal</label>
            <input type="date" value={sampai} onChange={e => setSampai(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm bg-[#f5f0e8] focus:outline-none" />
          </div>
          <button onClick={load} className="px-4 py-2 bg-[#a85e28] text-white rounded-xl text-sm font-semibold">Tampilkan</button>
          {laporan && (
            <button onClick={exportCsv} className="px-4 py-2 border border-border bg-white text-sm font-semibold rounded-xl flex items-center gap-2 hover:bg-[#f5f0e8]">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : laporan ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Pendapatan Reguler", val: laporan.total_reguler, color: "bg-blue-50 border-blue-200 text-blue-700" },
                { label: "Pendapatan Carter", val: laporan.total_carter, color: "bg-violet-50 border-violet-200 text-violet-700" },
                { label: "Total Pendapatan", val: laporan.total, color: "bg-green-50 border-green-200 text-green-700" },
              ].map(({ label, val, color }) => (
                <div key={label} className={`rounded-xl border p-4 ${color}`}>
                  <div className="text-xs font-semibold opacity-70">{label}</div>
                  <div className="text-xl font-bold mt-1">{fmtRp(val)}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#f5f0e8]">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-xs">Nama</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs">Jenis</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs">Rute</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs">Total</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs">Metode</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...laporan.bookings, ...laporan.carter].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(b => (
                      <tr key={`${b.jenis}-${b.id}`} className="hover:bg-[#f5f0e8]/50">
                        <td className="px-4 py-3 font-medium">{b.user?.nama ?? "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${b.jenis === "reguler" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                            {b.jenis}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {b.jenis === "reguler" && b.schedule ? `${b.schedule.origin_city} → ${b.schedule.destination_city}` : "Carter"}
                        </td>
                        <td className="px-4 py-3 font-semibold">{fmtRp(b.total_amount)}</td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{b.payment_method}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(b.created_at).toLocaleDateString("id-ID")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
