/** Only same-site paths are accepted, so a crafted ?next= link cannot send people to another website. */
export function safeNext(raw: string | null): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

/** Path + query of the current page without the site's base path. Browser only. */
export function currentAppPath(): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const { pathname, search } = window.location;
  const path = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
  return path + search;
}
