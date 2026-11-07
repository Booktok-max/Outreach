import { verifyUnsubscribeToken, unsubscribeContact } from "@/lib/unsubscribe";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage(title: string, heading: string, body: string, status: number): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)} - Atomic Shelf</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #0f172a; }
    main { max-width: 480px; padding: 2rem; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
    p { line-height: 1.5; color: #334155; }
    .brand { font-weight: 600; color: #4f46e5; margin-bottom: 1.5rem; }
    button { margin-top: 1.25rem; border: 0; border-radius: 0.5rem; background: #4f46e5; color: white; padding: 0.625rem 1rem; font-size: 0.95rem; cursor: pointer; }
    button:hover { background: #4338ca; }
  </style>
</head>
<body>
  <main>
    <p class="brand">Atomic Shelf</p>
    <h1>${escapeHtml(heading)}</h1>
    ${body}
  </main>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function handlePost(token: string | null, wantsJson: boolean): Promise<Response> {
  if (!token) {
    const body = "<p>This unsubscribe link is missing or invalid. No changes were made.</p>";
    if (wantsJson) return Response.json({ ok: false, error: "Missing token." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return renderPage("Unsubscribe", "Unsubscribe", body, 400);
  }

  const result = await unsubscribeContact(token);

  if (result.status === "invalid" || result.status === "not_found") {
    const body = "<p>This unsubscribe link is invalid or has expired. No changes were made.</p>";
    if (wantsJson) return Response.json({ ok: false, error: "Invalid or expired token." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return renderPage("Unsubscribe", "Unsubscribe", body, 400);
  }

  const body = "<p>You have been unsubscribed from Atomic Shelf author outreach. You will not receive further outreach emails from us.</p><p>If you believe this was a mistake, please contact us directly.</p>";
  if (wantsJson) return Response.json({ ok: true, status: result.status }, { status: 200, headers: { "Cache-Control": "no-store" } });
  return renderPage("Unsubscribed", "You have been unsubscribed", body, 200);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return renderPage(
      "Unsubscribe",
      "Unsubscribe",
      "<p>This unsubscribe link is missing or invalid. No changes were made.</p>",
      400,
    );
  }

  const payload = await verifyUnsubscribeToken(token);
  if (!payload) {
    return renderPage(
      "Unsubscribe",
      "Unsubscribe",
      "<p>This unsubscribe link is invalid or has expired. No changes were made.</p>",
      400,
    );
  }

  // GET must never mutate suppression state. Show a confirmation form that
  // submits an explicit POST.
  const form = `<p>Clicking the button below will unsubscribe this contact from Atomic Shelf author outreach.</p>
  <form method="post" action="/unsubscribe">
    <input type="hidden" name="token" value="${escapeHtml(token)}" />
    <button type="submit">Confirm unsubscribe</button>
  </form>`;

  return renderPage("Confirm unsubscribe", "Confirm unsubscribe", form, 200);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const wantsJson =
    (request.headers.get("accept") ?? "").includes("application/json") ||
    (request.headers.get("content-type") ?? "").includes("application/json");

  let token = url.searchParams.get("token");

  if (!token) {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        token = typeof body?.token === "string" ? body.token : null;
      } catch {
        token = null;
      }
    } else {
      try {
        const form = await request.formData();
        token = typeof form.get("token") === "string" ? (form.get("token") as string) : null;
      } catch {
        token = null;
      }
    }
  }

  return handlePost(token, wantsJson);
}