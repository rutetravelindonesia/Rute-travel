import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import AdminLayout from "./admin-layout";
import { Loader2, Star } from "lucide-react";

interface Rating {
  id: number; stars: number; comment: string | null; created_at: string;
  booking_id: number; ratee_id: number;
  rater: { id: number; nama: string } | null;
}

export default function AdminRatings() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const [rows, setRows] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await fetch(`${apiBase}/admin/ratings`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [token, apiBase]);

  useEffect(() => {
    if (!token || user?.role !== "admin") { setLocation("/admin/login"); return; }
    load();
  }, [token, user, load]);

  const avg = rows.length ? (rows.reduce((s, r) => s + r.stars, 0) / rows.length).toFixed(1) : "-";

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1208]">Monitor Rating</h1>
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="font-bold text-amber-700">{avg}</span>
            <span className="text-xs text-amber-600">/ 5 rata-rata ({rows.length} ulasan)</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-[#a85e28]" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Belum ada rating.</div>
        ) : (
          <div className="space-y-3">
            {rows.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="font-semibold text-sm">{r.rater?.nama ?? "–"}</div>
                    <div className="text-xs text-muted-foreground">Booking #{r.booking_id} · {new Date(r.created_at).toLocaleDateString("id-ID")}</div>
                    {r.comment && <p className="text-sm text-foreground mt-1">"{r.comment}"</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-4 h-4 ${i < r.stars ? "text-amber-500 fill-amber-500" : "text-gray-200 fill-gray-200"}`} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
