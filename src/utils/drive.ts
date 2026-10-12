// Only Google Drive links are accepted (also enforced by a CHECK constraint in the database).
const HOSTS = new Set(["drive.google.com", "docs.google.com", "drive.usercontent.google.com"]);

export function isAllowedDriveUrl(value: string): boolean {
  if (value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Turns a "share" link (…/file/d/<id>/view) into a direct-download link.
 * Folder links and other Google links are opened as they are. Returns null for anything else.
 */
export function toDownloadUrl(value: string): string | null {
  if (!isAllowedDriveUrl(value)) return null;
  const url = new URL(value);
  if (url.hostname === "drive.google.com") {
    const fromPath = url.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1];
    const fromQuery = url.pathname === "/open" || url.pathname === "/uc" ? url.searchParams.get("id") : null;
    const id = fromPath ?? fromQuery;
    if (id && /^[\w-]+$/.test(id)) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  return url.toString();
}
