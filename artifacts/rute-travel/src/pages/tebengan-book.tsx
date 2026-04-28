import { useLocation } from "wouter";
import { ArrowLeft, ArrowDownLeft, Clock } from "lucide-react";

export default function TebenganBook() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto flex flex-col">
      <div className="flex items-center gap-3 px-5 pt-10 pb-4 bg-card border-b border-border">
        <button
          onClick={() => setLocation("/dashboard-penumpang")}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Tebengan Pulang</h1>
          <p className="text-xs text-muted-foreground">Pesan kursi</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center">
        <div className="w-20 h-20 rounded-2xl bg-green-50 flex items-center justify-center mb-6">
          <ArrowDownLeft className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Segera Hadir</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          Pemesanan Tebengan Pulang sedang dalam pengembangan. Segera tersedia untuk memberikan pilihan perjalanan lebih hemat.
        </p>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-50 border border-amber-200">
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-700">Dalam pengembangan</span>
        </div>
      </div>
    </div>
  );
}
