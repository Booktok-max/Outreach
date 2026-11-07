import { verifyUnsubscribeToken, unsubscribeContact } from "@/lib/unsubscribe";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return Response.json({ ok: false, error: "Missing token." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const payload = await verifyUnsubscribeToken(token);
  if (!payload) {
    return Response.json({ ok: false, error: "Invalid or expired token." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  // GET is a non-mutating validation/preview endpoint.
  return Response.json({ ok: true, valid: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let token = url.searchParams.get("token");

  const contentType = request.headers.get("content-type") ?? "";
  if (!token) {
    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        token = typeof body?.token === "string" ? body.token : null;
      } catch {
        token = null;
      }
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      try {
        const form = await request.formData();
        token = typeof form.get("token") === "string" ? (form.get("token") as string) : null;
      } catch {
        token = null;
      }
    } else {
      // RFC 8058 one-click POST may have an empty or form-encoded body.
      try {
        const text = await request.text();
        if (text) {
          const params = new URLSearchParams(text);
          token = token ?? params.get("token");
        }
      } catch {
        token = null;
      }
    }
  }

  if (!token) {
    return Response.json({ ok: false, error: "Missing token." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const result = await unsubscribeContact(token);
  if (result.status === "invalid" || result.status === "not_found") {
    return Response.json({ ok: false, error: "Invalid or expired token." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true, status: result.status }, { status: 200, headers: { "Cache-Control": "no-store" } });
}