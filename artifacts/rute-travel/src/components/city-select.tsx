import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { KotaGrouped } from "@/hooks/useKota";

interface CitySelectProps {
  value: string;
  onChange: (val: string) => void;
  groups: KotaGrouped[];
  disabled?: boolean;
  placeholder: string;
  searchPlaceholder?: string;
  allowAll?: boolean;
  allLabel?: string;
  exclude?: string;
  testId?: string;
}

export function CitySelect({
  value,
  onChange,
  groups,
  disabled,
  placeholder,
  searchPlaceholder = "Cari kota...",
  allowAll,
  allLabel = "Semua kota",
  exclude,
  testId,
}: CitySelectProps) {
  const [open, setOpen] = useState(false);

  const display = value || placeholder;
  const muted = !value && !allowAll;

  const select = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={value || placeholder}
          disabled={disabled}
          data-testid={testId}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className={cn("truncate", muted && "text-muted-foreground")}>{display}</span>
          <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Kota tidak ditemukan.</CommandEmpty>
            {allowAll && (
              <CommandGroup>
                <CommandItem value={allLabel} onSelect={() => select("")}>
                  <Check className={cn("w-4 h-4", value === "" ? "opacity-100" : "opacity-0")} />
                  {allLabel}
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((g) => {
              const kota = exclude ? g.kota.filter((k) => k !== exclude) : g.kota;
              if (kota.length === 0) return null;
              return (
                <CommandGroup key={g.label} heading={g.label}>
                  {kota.map((k) => (
                    <CommandItem key={k} value={k} onSelect={() => select(k)}>
                      <Check className={cn("w-4 h-4", value === k ? "opacity-100" : "opacity-0")} />
                      {k}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
