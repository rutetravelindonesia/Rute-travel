import { useEffect } from "react";
import { X } from "lucide-react";

interface Props {
  url: string;
  name?: string;
  onClose: () => void;
}

export function PhotoLightbox({ url, name, onClose }: Props) {
  useEffect(() => {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const original = viewport?.content ?? "";
    if (viewport) {
      viewport.content = "width=device-width, initial-scale=1.0, maximum-scale=5";
    }
    return () => {
      if (viewport) viewport.content = original;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/50 rounded-full p-2"
        aria-label="Tutup"
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="flex flex-col items-center gap-3 px-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={url}
          alt={name ?? "Foto profil"}
          className="w-full rounded-2xl object-contain max-h-[75vh] shadow-2xl"
          style={{ touchAction: "pinch-zoom" }}
        />
        {name && (
          <p className="text-white font-semibold text-sm text-center">{name}</p>
        )}
      </div>
    </div>
  );
}
