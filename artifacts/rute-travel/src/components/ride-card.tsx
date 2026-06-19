import type { ReactNode } from "react";
import { ChevronRight, Clock, Car, Star, Users, ShieldCheck } from "lucide-react";

interface DriverAvatarProps {
  foto: string | null;
  fallback: string;
  size: "sm" | "md";
  theme: "amber" | "accent";
  onPhotoClick?: () => void;
  driverName: string;
}

function DriverAvatar({ foto, fallback, size, theme, onPhotoClick, driverName }: DriverAvatarProps) {
  const sizeCls = size === "md" ? "w-14 h-14 text-lg" : "w-12 h-12 text-sm";
  const themeCls =
    theme === "amber"
      ? "bg-amber-100 border-2 border-amber-200 text-amber-700 font-bold"
      : "bg-accent text-white font-bold";
  const cursorCls = foto ? "cursor-zoom-in" : "cursor-default";

  return (
    <button
      type="button"
      onClick={(e) => {
        if (!foto || !onPhotoClick) return;
        e.stopPropagation();
        onPhotoClick();
      }}
      className={`${sizeCls} ${themeCls} ${cursorCls} rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center`}
      aria-label={foto ? `Lihat foto ${driverName}` : undefined}
    >
      {foto ? (
        <img src={foto} alt={driverName} className="w-full h-full object-cover" />
      ) : (
        fallback
      )}
    </button>
  );
}

export interface RideCardRideProps {
  variant: "ride";
  testId?: string;
  onClick: () => void;
  driverFoto: string | null;
  driverInitial: string;
  driverName: string;
  onAvatarClick?: () => void;
  isJadwal: boolean;
  isToday: boolean;
  originCity: string;
  destinationCity: string;
  departureTime: string;
  departureDate: string;
  kursiTersisa: number;
  displayPrice: number;
  pricePerSeat: number;
  rating: { avg: number; count: number } | null | undefined;
  ratingTestId?: string;
  vehicleLine: ReactNode | null;
  stopovers?: string[];
}

export interface RideCardCarterProps {
  variant: "carter";
  testId?: string;
  onClick: () => void;
  driverFoto: string | null;
  driverInitials: string;
  driverName: string;
  onAvatarClick?: () => void;
  originCity: string;
  destinationCity: string;
  is24Hours: boolean;
  hoursStart: string | null;
  hoursEnd: string | null;
  settingsId: number;
  totalPrice: number;
  vehicleLine: string;
}

export type RideCardProps = RideCardRideProps | RideCardCarterProps;

export function RideCard(props: RideCardProps) {
  if (props.variant === "ride") {
    return <RideVariantCard {...props} />;
  }
  return <CarterVariantCard {...props} />;
}

function RideVariantCard({
  testId,
  onClick,
  driverFoto,
  driverInitial,
  driverName,
  onAvatarClick,
  isJadwal,
  isToday,
  originCity,
  destinationCity,
  departureTime,
  departureDate,
  kursiTersisa,
  displayPrice,
  pricePerSeat,
  rating,
  ratingTestId,
  vehicleLine,
  stopovers,
}: RideCardRideProps) {
  function formatRupiah(n: number) {
    return "Rp " + n.toLocaleString("id-ID");
  }

  function shortDate(d: string) {
    if (!d) return "";
    const dt = new Date(d);
    return dt.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
  }

  return (
    <div
      data-testid={testId}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="w-full bg-card rounded-2xl border border-border p-4 text-left active:scale-[0.99] transition-transform cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <DriverAvatar
          foto={driverFoto}
          fallback={driverInitial}
          size="md"
          theme="amber"
          onPhotoClick={onAvatarClick}
          driverName={driverName}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {isJadwal ? (
              <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 uppercase inline-flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" /> Jadwal Tetap
              </span>
            ) : (
              <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-green-100 text-green-700 uppercase">
                Tebengan Pulang
              </span>
            )}
            {isToday && (
              <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">
                Hari Ini
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-foreground leading-tight">
            {originCity} → {destinationCity}
          </p>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            {isJadwal ? (
              <span className="flex items-center gap-1" title="Jam komitmen mitra">
                <Clock className="w-3 h-3" />{departureTime}
              </span>
            ) : (
              <span className="flex items-center gap-1" title="Perkiraan jam berangkat — fleksibel">
                <Clock className="w-3 h-3" />~{departureTime}
              </span>
            )}
            <span>{shortDate(departureDate)}</span>
          </div>
          {stopovers && stopovers.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
              Singgah di:{" "}
              <span className="font-medium text-foreground/80">{stopovers.join(" → ")}</span>
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="w-3 h-3" />
          <span>{kursiTersisa} kursi sisa</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-accent">
            {formatRupiah(displayPrice)}
            <span className="text-[10px] text-muted-foreground font-normal"> /kursi</span>
          </p>
          {displayPrice !== pricePerSeat && (
            <p className="text-[9px] text-muted-foreground line-through">{formatRupiah(pricePerSeat)} penuh</p>
          )}
        </div>
      </div>
      {driverName && (
        <div className="mt-2 space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">
              Mitra: <span className="font-medium text-foreground">{driverName}</span>
            </p>
            {rating && rating.count > 0 ? (
              <span
                className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-700 flex-shrink-0"
                data-testid={ratingTestId}
              >
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                {rating.avg.toFixed(1)}
                <span className="text-muted-foreground font-normal ml-0.5">({rating.count})</span>
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground flex-shrink-0" data-testid={ratingTestId}>
                Mitra baru
              </span>
            )}
          </div>
          {vehicleLine && (
            <p className="text-[11px] text-muted-foreground">{vehicleLine}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CarterVariantCard({
  testId,
  onClick,
  driverFoto,
  driverInitials,
  driverName,
  onAvatarClick,
  originCity,
  destinationCity,
  is24Hours,
  hoursStart,
  hoursEnd,
  settingsId,
  totalPrice,
  vehicleLine,
}: RideCardCarterProps) {
  function formatRupiah(n: number) {
    return "Rp " + n.toLocaleString("id-ID");
  }

  return (
    <div
      data-testid={testId}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="w-full text-left bg-card rounded-2xl border border-border p-4 hover:border-accent/60 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <DriverAvatar
          foto={driverFoto}
          fallback={driverInitials}
          size="sm"
          theme="accent"
          onPhotoClick={onAvatarClick}
          driverName={driverName}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{driverName}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Car className="w-3 h-3" />
            {vehicleLine}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded uppercase ${
                is24Hours ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
              data-testid={`mitra-jam-${settingsId}`}
            >
              {is24Hours ? "24 Jam" : `${hoursStart ?? "?"}–${hoursEnd ?? "?"}`}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {originCity} → {destinationCity}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-extrabold text-accent" data-testid={`mitra-harga-${settingsId}`}>
            {formatRupiah(totalPrice)}
          </p>
          <p className="text-[10px] text-muted-foreground">total</p>
          <ChevronRight className="w-4 h-4 text-muted-foreground inline-block mt-1" />
        </div>
      </div>
    </div>
  );
}
