import { useMemo, useState, useEffect } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { KotaRow } from "@/hooks/useKota";

interface ProvinsiKotaPickerProps {
  kota: KotaRow[];
  value: string;
  onChange: (kotaLower: string) => void;
  label?: string;
}

const inputClass =
  "w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm appearance-none";

export function ProvinsiKotaPicker({
  kota,
  value,
  onChange,
  label = "Kota Domisili",
}: ProvinsiKotaPickerProps) {
  const [provinsi, setProvinsi] = useState("");
  const [open, setOpen] = useState(false);

  const provinsiList = useMemo(() => {
    const set = new Set<string>();
    for (const k of kota) if (k.provinsi) set.add(k.provinsi);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
  }, [kota]);

  const kotaOptions = useMemo(() => {
    if (!provinsi) return [];
    return kota
      .filter((k) => k.provinsi === provinsi)
      .map((k) => k.nama_kota)
      .sort((a, b) => a.localeCompare(b, "id"));
  }, [kota, provinsi]);

  useEffect(() => {
    if (value && !provinsi) {
      const row = kota.find((k) => k.nama_kota.toLowerCase() === value.toLowerCase());
      if (row?.provinsi) setProvinsi(row.provinsi);
    }
  }, [value, kota, provinsi]);

  const selectedDisplay = useMemo(() => {
    const row = kota.find((k) => k.nama_kota.toLowerCase() === value.toLowerCase());
    return row?.nama_kota ?? "";
  }, [kota, value]);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
          Provinsi
        </label>
        <div className="relative">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            data-testid="select-provinsi"
            value={provinsi}
            onChange={(e) => {
              setProvinsi(e.target.value);
              onChange("");
            }}
            className={inputClass}
          >
            <option value="">Pilih provinsi</option>
            {provinsiList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold tracking-widest text-foreground/60 uppercase mb-2 block">
          {label}
        </label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              disabled={!provinsi}
              data-testid="select-kota"
              className={cn(
                "relative flex items-center w-full pl-10 pr-10 py-3.5 rounded-xl border border-border bg-card text-left text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed",
                selectedDisplay ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <span className="truncate">
                {selectedDisplay || (provinsi ? "Pilih kota" : "Pilih provinsi dulu")}
              </span>
              <ChevronsUpDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="p-0 w-[var(--radix-popover-trigger-width)]"
          >
            <Command>
              <CommandInput placeholder="Cari kota..." />
              <CommandList>
                <CommandEmpty>Kota tidak ditemukan.</CommandEmpty>
                <CommandGroup>
                  {kotaOptions.map((k) => (
                    <CommandItem
                      key={k}
                      value={k}
                      onSelect={() => {
                        onChange(k.toLowerCase());
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === k.toLowerCase() ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {k}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
