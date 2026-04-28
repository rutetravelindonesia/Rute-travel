export function resolvePhotoUrl(
  path: string | null | undefined,
  apiBase: string
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${apiBase}/storage${path}`;
}
