import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="text-center">
        <p className="text-6xl font-bold text-foreground/10 mb-4">404</p>
        <h1 className="text-xl font-semibold text-foreground mb-2">Halaman tidak ditemukan</h1>
        <p className="text-sm text-muted-foreground mb-8">Sepertinya rute ini belum ada.</p>
        <button
          onClick={() => setLocation("/login")}
          className="flex items-center gap-2 mx-auto px-6 py-3 rounded-xl font-medium text-sm transition-all hover:opacity-80"
          style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Login
        </button>
      </div>
    </div>
  );
}
