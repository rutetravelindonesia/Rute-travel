import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, MapPin, Sparkles } from "lucide-react";
import { SEMUA_DESTINASI, type Destinasi } from "@/data/destinasi";

function DestinasiCard({ d, onClick }: { d: Destinasi; onClick: () => void }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl overflow-hidden relative"
      style={{ height: 200 }}
    >
      {!imgErr ? (
        <img
          src={d.photo}
          alt={d.nama}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: d.grad }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10" />
      <div className="relative p-4 flex flex-col h-full">
        <span className="self-start bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full">
          {d.kota}
        </span>
        <div className="mt-auto">
          <h3 className="text-white font-bold text-base leading-snug">{d.nama}</h3>
          <p className="text-white/80 text-xs mt-0.5">{d.tagline}</p>
          {d.highlight && (
            <p className="text-white/60 text-[11px] mt-1">{d.highlight}</p>
          )}
          <p className="flex items-center gap-1 text-white/60 text-[11px] mt-2">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {d.jarak}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function DestinasiWisataPage() {
  const [, setLocation] = useLocation();

  const kaltim = SEMUA_DESTINASI.filter((d) => d.provinsi === "Kalimantan Timur");
  const kaltara = SEMUA_DESTINASI.filter((d) => d.provinsi === "Kalimantan Utara");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => history.back()}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Destinasi Wisata</h1>
            <p className="text-[11px] text-muted-foreground">Kalimantan Timur & Utara</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-8">
        {/* Kalimantan Timur */}
        <div className="mt-5 mb-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">
            Kalimantan Timur
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-1 gap-3 mt-3">
          {kaltim.map((d) => (
            <DestinasiCard key={d.nama} d={d} onClick={() => setLocation("/carter/cari")} />
          ))}
        </div>

        {/* Kalimantan Utara */}
        <div className="mt-7 mb-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">
            Kalimantan Utara
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-1 gap-3 mt-3">
          {kaltara.map((d) => (
            <DestinasiCard key={d.nama} d={d} onClick={() => setLocation("/carter/cari")} />
          ))}
        </div>

        {/* CTA Carter */}
        <div className="mt-8 bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">Mau ke sana bareng rombongan?</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sewa kendaraan penuh lewat fitur Carter
            </p>
          </div>
          <button
            onClick={() => setLocation("/carter/cari")}
            className="flex-shrink-0 bg-foreground text-card text-xs font-bold px-3.5 py-2 rounded-xl"
          >
            Carter
          </button>
        </div>
      </div>
    </div>
  );
}
