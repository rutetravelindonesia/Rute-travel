import { useState, useEffect } from "react";

export interface KotaGrouped {
  label: string;
  kota: string[];
}

const WILAYAH_ORDER = [
  "Kota",
  "Kab. Kutai Kartanegara",
  "Kab. Kutai Timur",
  "Kab. Kutai Barat",
  "Kab. Berau",
  "Kab. Penajam Paser Utara",
  "Kalimantan Utara",
];

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export function useKota() {
  const [kotaGrouped, setKotaGrouped] = useState<KotaGrouped[]>([]);
  const [kotaList, setKotaList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/kota`)
      .then((r) => r.json())
      .then((data: { id: number; nama_kota: string; wilayah: string | null }[]) => {
        const byWilayah: Record<string, string[]> = {};
        for (const d of data) {
          const w = d.wilayah ?? "Lainnya";
          if (!byWilayah[w]) byWilayah[w] = [];
          byWilayah[w].push(d.nama_kota);
        }
        for (const w of Object.keys(byWilayah)) {
          byWilayah[w].sort((a, b) => a.localeCompare(b, "id"));
        }
        const grouped: KotaGrouped[] = [];
        for (const w of WILAYAH_ORDER) {
          if (byWilayah[w]?.length) grouped.push({ label: w, kota: byWilayah[w] });
        }
        // Append any extra wilayah not in the default order
        for (const w of Object.keys(byWilayah)) {
          if (!WILAYAH_ORDER.includes(w) && w !== "Lainnya") {
            grouped.push({ label: w, kota: byWilayah[w] });
          }
        }
        if (byWilayah["Lainnya"]?.length) {
          grouped.push({ label: "Lainnya", kota: byWilayah["Lainnya"] });
        }
        const list = data.map((d) => d.nama_kota).sort((a, b) => a.localeCompare(b, "id"));
        setKotaGrouped(grouped);
        setKotaList(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { kotaGrouped, kotaList, loading };
}
