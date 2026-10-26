// Supabase Edge Function: Adobe Firefly Generative Expand.
// Keep Adobe credentials in Supabase Function secrets. Never expose them to the browser.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 4096;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function adobeAccessToken(clientId: string, clientSecret: string) {
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "openid,AdobeID,read_organizations,firefly_enterprise,firefly_api,ff_apis",
  });
  const response = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const result = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !result.access_token) throw new Error("Không xác thực được Adobe Firefly Services.");
  return result.access_token;
}

async function adobeError(response: Response, fallback: string) {
  const body = await response.text().catch(() => "");
  console.error("Adobe request failed:", response.status, body.slice(0, 1000));
  return json({ error: fallback }, 502);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Phương thức không được hỗ trợ." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Hãy đăng nhập để dùng tính năng này." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Chưa cấu hình xác thực Supabase." }, 500);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại." }, 401);

  const clientId = Deno.env.get("ADOBE_FIREFLY_CLIENT_ID");
  const clientSecret = Deno.env.get("ADOBE_FIREFLY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return json({ error: "Chưa kết nối Adobe Firefly Services. Quản trị viên cần cấu hình hai khóa Adobe trong Supabase Functions Secrets." }, 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Dữ liệu ảnh gửi lên không hợp lệ." }, 400);
  }
  const image = form.get("image");
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (!(image instanceof File)) return json({ error: "Thiếu ảnh cần mở rộng." }, 400);
  if (!ALLOWED_TYPES.has(image.type)) return json({ error: "Chỉ nhận ảnh JPG, PNG hoặc WebP." }, 415);
  if (image.size < 1 || image.size > MAX_UPLOAD_BYTES) return json({ error: "Ảnh tối đa 25 MB." }, 413);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > MAX_SIDE || height > MAX_SIDE) {
    return json({ error: "Kích thước mở rộng không hợp lệ (tối đa 4096 px mỗi cạnh)." }, 400);
  }

  try {
    const token = await adobeAccessToken(clientId, clientSecret);
    const uploadResponse = await fetch("https://firefly-api.adobe.io/v2/storage/image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-API-Key": clientId,
        "Content-Type": image.type,
        "Content-Length": String(image.size),
      },
      body: await image.arrayBuffer(),
    });
    if (!uploadResponse.ok) return await adobeError(uploadResponse, "Adobe không nhận được ảnh tải lên.");

    const uploaded = await uploadResponse.json() as { images?: { id?: string }[] };
    const uploadId = uploaded.images?.[0]?.id;
    if (!uploadId) return json({ error: "Adobe không trả mã ảnh đã tải lên." }, 502);

    const expandResponse = await fetch("https://firefly-api.adobe.io/v3/images/expand-async", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-API-Key": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        numVariations: 1,
        image: { source: { uploadId } },
        size: { width, height },
      }),
    });
    if (!expandResponse.ok) return await adobeError(expandResponse, "Adobe chưa tạo được phần ảnh mở rộng.");

    const job = await expandResponse.json() as { statusUrl?: string };
    if (!job.statusUrl) return json({ error: "Adobe không trả trạng thái xử lý." }, 502);
    const statusUrl = new URL(job.statusUrl);
    if (statusUrl.protocol !== "https:" || statusUrl.hostname !== "firefly-api.adobe.io" || !statusUrl.pathname.startsWith("/v3/status/")) {
      return json({ error: "Địa chỉ trạng thái Adobe không hợp lệ." }, 502);
    }

    const deadline = Date.now() + 70_000;
    let resultUrl = "";
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const statusResponse = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${token}`, "X-API-Key": clientId },
      });
      if (!statusResponse.ok) return await adobeError(statusResponse, "Không kiểm tra được trạng thái xử lý Adobe.");
      const status = await statusResponse.json() as {
        status?: string;
        result?: { outputs?: { image?: { url?: string } }[] };
      };
      if (status.status === "failed") return json({ error: "Adobe không thể mở rộng ảnh này." }, 502);
      if (status.status === "succeeded") {
        resultUrl = status.result?.outputs?.[0]?.image?.url ?? "";
        break;
      }
    }
    if (!resultUrl) return json({ error: "Adobe đang xử lý lâu hơn dự kiến. Hãy thử lại sau ít phút." }, 504);

    const outputUrl = new URL(resultUrl);
    if (outputUrl.protocol !== "https:") return json({ error: "Tệp kết quả Adobe không hợp lệ." }, 502);
    const outputResponse = await fetch(outputUrl);
    if (!outputResponse.ok || !outputResponse.body) return json({ error: "Không tải được ảnh kết quả từ Adobe." }, 502);

    return new Response(outputResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": outputResponse.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Generative Expand failed:", error);
    return json({ error: error instanceof Error ? error.message : "Không mở rộng được ảnh." }, 500);
  }
});
