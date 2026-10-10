/** Only same-site paths are accepted, so a crafted ?next= link cannot send people to another website. */
export function safeNext(raw: string | null): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}
