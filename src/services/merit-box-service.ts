/**
 * Reads the QR code that the admin manages in the QR management screen.
 *
 * >>> Adjust CONFIG below so it matches the table the admin screen writes to. <<<
 * It talks to Supabase's REST API directly (no client import), using the public URL and anon key.
 * The table therefore needs a SELECT policy that lets the anon role read the QR row.
 */
const CONFIG = {
  table: "qr_codes",
  imageColumn: "image_url", // full image URL, or a path inside `bucket` (see below)
  titleColumn: "title" as string | null, // optional caption shown under the QR
  noteColumn: "note" as string | null, // optional extra text, e.g. account name / bank
  filters: ["is_active=eq.true"] as string[], // PostgREST filters picking the merit-box QR
  orderBy: "created_at.desc", // newest matching row wins
  bucket: "qr" as string | null, // Storage bucket, only used when imageColumn holds a path instead of a URL
};

export type MeritBoxQr = { imageUrl: string; title: string | null; note: string | null };

export async function getMeritBoxQr(): Promise<MeritBoxQr | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Missing Supabase public URL or anon key");

  const columns = [CONFIG.imageColumn, CONFIG.titleColumn, CONFIG.noteColumn].filter((c): c is string => Boolean(c));
  const params = new URLSearchParams({ select: columns.join(","), order: CONFIG.orderBy, limit: "1" });
  for (const filter of CONFIG.filters) {
    const at = filter.indexOf("=");
    if (at > 0) params.append(filter.slice(0, at), filter.slice(at + 1));
  }

  const res = await fetch(`${base}/rest/v1/${CONFIG.table}?${params.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Could not load the QR code (${res.status})`);

  const rows = (await res.json()) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return null;

  const raw = row[CONFIG.imageColumn];
  if (typeof raw !== "string" || !raw) return null;
  const imageUrl = /^(https?:|data:)/i.test(raw)
    ? raw
    : `${base}/storage/v1/object/public/${CONFIG.bucket ?? "qr"}/${raw.replace(/^\//, "")}`;

  const text = (column: string | null) => {
    const value = column ? row[column] : null;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return { imageUrl, title: text(CONFIG.titleColumn), note: text(CONFIG.noteColumn) };
}
