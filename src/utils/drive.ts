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
    // confirm=t skips the "too large to scan for viruses" page so the file starts downloading right away
    if (id && /^[\w-]+$/.test(id)) return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  }
  return url.toString();
}

/** True for a direct file download (it can run in the current tab without leaving the site). */
export function isDirectDownload(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "drive.usercontent.google.com" && url.pathname === "/download";
  } catch {
    return false;
  }
}
