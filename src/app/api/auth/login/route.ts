import { NextResponse } from "next/server";

import { handleApiError, jsonOk, readJsonBody } from "@/lib/api/http";
import { LoginSchema } from "@/lib/api/schemas";
import { getSession, login } from "@/lib/auth";

/** POST /api/auth/login - single internal operator account. */
export async function POST(request: Request) {
  try {
    const existing = await getSession();
    if (existing) return jsonOk({ ok: true, user: existing.sub });

    const body = await readJsonBody<unknown>(request);
    const parsed = LoginSchema.parse(body);

    const ok = await login(parsed.username, parsed.password);
    if (!ok) {
      // Same generic message for unknown user and wrong password.
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    return jsonOk({ ok: true, user: parsed.username });
  } catch (error) {
    return handleApiError(error);
  }
}
