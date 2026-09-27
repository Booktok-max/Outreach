import { prisma } from "@/lib/db";
import { jsonOk } from "@/lib/api/http";

/** GET /api/health - public liveness probe (no contact data). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return jsonOk({ status: "ok", database: "up" });
  } catch {
    return jsonOk({ status: "degraded", database: "down" }, 200);
  }
}
