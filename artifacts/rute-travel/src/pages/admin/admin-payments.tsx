import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, CheckCircle, XCircle, ExternalLink } from "lucide-react";

interface PaymentItem {
  id: number; status: string; total_amount: number; created_at: string;
  payment_method: string; payment_proof_url: string | null;
  user: { id: number; nama: string } | null;
  jenis: "reguler" | "carter";
  schedule?: { origin_city: string; destination_city: string } | null;
}

export default function AdminPayments() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [reguler, setReguler] = useState<PaymentItem[]>([]);
  const [carter, setCarter] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"reguler" | "carter">("reguler");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/payments`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setReguler(Array.isArray(d.schedule) ? d.schedule : []);
    setCarter(Array.isArray(d.carter) ? d.carter : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  async function action(jenis: "reguler" | "carter", id: number, act: "confirm" | "reject") {
    const key = `${jenis}-${id}-${act}`;
    setBusy(key);
    const path = jenis === "reguler"
      ? `/admin/payments/booking/${id}/${act}`
      : `/admin/payments/carter/${id}/${act}`;
    await fetch(`${apiBase}${path}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setBusy(null);
    await load();
  }

  const fmtRp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(n);
  const rows = tab === "reguler" ? reguler : carter;

  return (
    <AdminLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[#1a1208]">Verifikasi Pembayaran</h1>

        <div className="flex gap-2">
          {(["reguler", "carter"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${tab === t ? "bg-[#a85e28] text-white" : "bg-white border border-border text-muted-foreground"}`}>
              {t === "reguler" ? `Reguler (${reguler.length})` : `Carter (${carter.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Tidak ada pembayaran yang menunggu verifikasi.</div>
        ) : (
          <div className="space-y-3">
            {rows.map(b => (
              <div key={b.id} className="bg-white rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 space-y-1">
                  <div className="font-semibold text-sm">{b.user?.nama ?? "–"}</div>
                  {b.jenis === "reguler" && b.schedule && (
                    <div className="text-xs text-muted-foreground">{b.schedule.origin_city} → {b.schedule.destination_city}</div>
                  )}
                  <div className="text-xs text-muted-foreground">{fmtRp(b.total_amount)} · {b.payment_method} · {new Date(b.created_at).toLocaleDateString("id-ID")}</div>
                </div>
                <div className="flex items-center gap-2">
                  {b.payment_proof_url && (
                    <a href={`${apiBase}/storage${b.payment_proof_url}`} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-lg border border-border hover:bg-[#f5f0e8] text-[#a85e28]">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button onClick={() => action(b.jenis, b.id, "confirm")} disabled={!!busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-60">
                    {busy === `${b.jenis}-${b.id}-confirm` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Konfirmasi
                  </button>
                  <button onClick={() => action(b.jenis, b.id, "reject")} disabled={!!busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-60">
                    {busy === `${b.jenis}-${b.id}-reject` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
