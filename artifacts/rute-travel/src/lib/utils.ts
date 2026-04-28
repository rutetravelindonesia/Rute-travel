import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDriverPhotoUrl(storageBase: string, fotoProfil: string | null | undefined): string | null {
  if (!fotoProfil) return null;
  if (/^https?:\/\//i.test(fotoProfil)) return fotoProfil;
  const base = storageBase.replace(/\/$/, "");
  const path = fotoProfil.startsWith("/") ? fotoProfil : `/${fotoProfil}`;
  return `${base}/storage${path}`;
}
