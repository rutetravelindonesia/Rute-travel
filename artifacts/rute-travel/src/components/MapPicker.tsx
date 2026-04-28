import { useEffect, useState, useRef } from "react";
import L, { type LeafletMouseEvent, type Map as LeafletMap, type Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { X, Search, MapPin, Loader2 } from "lucide-react";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

const KOTA_CENTER: Record<string, [number, number]> = {
  Balikpapan: [-1.2654, 116.8312],
  Bengalon: [1.0167, 117.5333],
  Berau: [2.1500, 117.4833],
  "Biduk Biduk": [1.8167, 118.1167],
  Bontang: [0.1297, 117.5086],
  Kaliorang: [0.8833, 117.8167],
  Karangan: [1.0000, 116.9167],
  "Kembang Janggut": [0.0833, 116.7167],
  "Kota Bangun": [-0.0333, 116.5333],
  "Kutai Lama": [-0.5833, 117.0500],
  Melak: [-0.0667, 115.7667],
  "Muara Badak": [0.2833, 117.3167],
  "Muara Kaman": [-0.0167, 116.7167],
  Penajam: [-1.2667, 116.8167],
  "Rantau Pulung": [0.8167, 117.4833],
  Samarinda: [-0.4946, 117.1436],
  "Sanga Sanga": [-0.6833, 117.1833],
  Sangatta: [0.4806, 117.5894],
  Sangkulirang: [0.9333, 117.9167],
  Sebulu: [-0.1167, 117.0833],
  Sendawar: [-0.0667, 115.7667],
  Separi: [-0.1833, 117.0167],
  "Tali Sayan": [1.9167, 117.1333],
  "Tanah Kuning": [2.9167, 117.2833],
  "Tanjung Batu": [1.0333, 117.6167],
  "Tanjung Redeb": [2.1500, 117.5000],
  "Tanjung Selor": [2.8333, 117.3667],
  Tarakan: [3.3274, 117.5765],
  Tenggarong: [-0.4083, 116.9869],
  Wahau: [0.7167, 116.8333],
};

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export interface PickedAddress {
  label: string;
  detail: string | null;
  lat: number | null;
  lng: number | null;
}

interface MapPickerProps {
  isOpen: boolean;
  city: string;
  title: string;
  initialValue: PickedAddress | null;
  onCancel: () => void;
  onConfirm: (addr: PickedAddress) => void;
}

export default function MapPicker({ isOpen, city, title, initialValue, onCancel, onConfirm }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLabel(initialValue?.label ?? "");
    setDetail(initialValue?.detail ?? "");
    setLat(initialValue?.lat ?? null);
    setLng(initialValue?.lng ?? null);
    setQuery("");
    setSuggestions([]);
  }, [isOpen, initialValue]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      if (!mapRef.current || leafletMapRef.current) return;
      const initLat = initialValue?.lat ?? KOTA_CENTER[city]?.[0] ?? -0.4946;
      const initLng = initialValue?.lng ?? KOTA_CENTER[city]?.[1] ?? 117.1436;
      const map = L.map(mapRef.current).setView([initLat, initLng], initialValue?.lat ? 16 : 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      if (initialValue?.lat && initialValue?.lng) {
        const m = L.marker([initialValue.lat, initialValue.lng]).addTo(map);
        markerRef.current = m;
      }

      map.on("click", (e: LeafletMouseEvent) => {
        const { lat: clat, lng: clng } = e.latlng;
        setLat(clat);
        setLng(clng);
        if (markerRef.current) markerRef.current.setLatLng([clat, clng]);
        else markerRef.current = L.marker([clat, clng]).addTo(map);
      });

      leafletMapRef.current = map;
      setTimeout(() => map.invalidateSize(), 100);
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen, city, initialValue]);

  useEffect(() => {
    if (!isOpen) {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markerRef.current = null;
      }
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", `${query}, ${city}, Kalimantan Timur, Indonesia`);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "5");
      url.searchParams.set("countrycodes", "id");
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  };

  const pickSuggestion = (s: Suggestion) => {
    const slat = parseFloat(s.lat);
    const slng = parseFloat(s.lon);
    setLat(slat);
    setLng(slng);
    setLabel((prev) => prev || s.display_name.split(",")[0] || "");
    setSuggestions([]);
    setQuery(s.display_name.split(",").slice(0, 3).join(", "));
    if (leafletMapRef.current) {
      leafletMapRef.current.setView([slat, slng], 17);
      if (markerRef.current) markerRef.current.setLatLng([slat, slng]);
      else markerRef.current = L.marker([slat, slng]).addTo(leafletMapRef.current);
    }
  };

  const submit = () => {
    if (!label.trim()) return;
    onConfirm({
      label: label.trim(),
      detail: detail.trim() || null,
      lat,
      lng,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" data-testid="map-picker-modal">
      <div className="w-full max-w-md bg-card rounded-t-3xl flex flex-col h-[92vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button
            data-testid="map-picker-close"
            onClick={onCancel}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                data-testid="map-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                placeholder={`Cari tempat di ${city}...`}
                className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <button
              data-testid="map-search-btn"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="px-3 py-2 rounded-xl bg-accent text-white text-xs font-bold disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cari"}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="bg-background border border-border rounded-xl max-h-32 overflow-y-auto" data-testid="map-suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => pickSuggestion(s)}
                  data-testid={`map-suggestion-${i}`}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b border-border last:border-b-0"
                >
                  <MapPin className="w-3 h-3 inline mr-1 text-accent" />
                  {s.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 px-4 pb-2 min-h-0">
          <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden border border-border bg-muted" data-testid="map-canvas" />
        </div>

        <div className="px-4 pt-2 pb-3 space-y-2 border-t border-border">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {lat !== null && lng !== null ? `Koordinat: ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Tap di peta atau cari nama tempat"}
          </div>
          <input
            data-testid="map-label-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nama tempat (contoh: Rumah, Bandara SAMS, Hotel Bumi Senyiur)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <input
            data-testid="map-detail-input"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Detail (opsional): Jl. Juanda No. 12, pagar hijau"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            data-testid="map-confirm-btn"
            onClick={submit}
            disabled={!label.trim()}
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-50"
          >
            Pakai alamat ini
          </button>
        </div>
      </div>
    </div>
  );
}
