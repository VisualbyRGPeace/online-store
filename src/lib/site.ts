/** Absolute URL of a page on this site, including the GitHub Pages base path. Browser only. */
export function absoluteUrl(path: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${basePath}${path}`;
}
