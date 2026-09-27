import { handleApiError, jsonOk } from "@/lib/api/http";
import { logout } from "@/lib/auth";

/** POST /api/auth/logout - clears the session cookie. */
export async function POST() {
  try {
    await logout();
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
