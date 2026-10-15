// Supabase Edge Function: receives SePay's "money received" webhook.
//
// Setup (see the chat instructions):
//   1. Secret SEPAY_API_KEY = the same random key you type in SePay > WebHooks > "API Key".
//   2. Deploy with "Verify JWT" turned OFF (SePay does not send a Supabase token; this function
//      authenticates SePay with the API key instead).
//   3. SePay webhook URL: https://<project-ref>.supabase.co/functions/v1/sepay-webhook
//
// This function decides nothing about prices or who gets what: it only checks that the call really comes
// from SePay and hands the transfer to the database function apply_bank_transfer(), which matches the payment
// code, checks the amount and unlocks the file. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically by Supabase at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";

const API_KEY = Deno.env.get("SEPAY_API_KEY") ?? "";

function respond(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Compares two strings without leaking where they differ.
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond({ success: false }, 405);

  // SePay sends:  Authorization: Apikey <your key>
  if (API_KEY.length < 16 || !sameSecret(req.headers.get("authorization") ?? "", `Apikey ${API_KEY}`)) {
    return respond({ success: false }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond({ success: false }, 400);
  }

  // Only money coming IN matters; acknowledge everything else so SePay does not retry.
  if (body.transferType !== "in") return respond({ success: true }, 201);

  const amount = Number(body.transferAmount);
  const ref = String(body.id ?? body.referenceCode ?? "");
  if (!Number.isInteger(amount) || amount <= 0 || ref === "") return respond({ success: false }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("apply_bank_transfer", {
    p_content: String(body.content ?? body.description ?? ""),
    p_code_hint: body.code ? String(body.code) : null,
    p_amount: amount,
    p_ref: ref,
    p_payload: body,
  });
  if (error) {
    console.error("apply_bank_transfer failed", error);
    return respond({ success: false }, 500); // SePay will retry
  }
  console.log("transfer", ref, "->", data);
  return respond({ success: true }, 201);
});
