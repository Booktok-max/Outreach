import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getEnv } from "./env";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./session";

/** Single internal operator account (V1). Credentials live only in .env. */
export { SESSION_COOKIE };


function secretEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

/** Constant-time credential check. Never logs the values involved. */
export function credentialsMatch(username: string, password: string): boolean {
  const env = getEnv();
  return secretEqual(username, env.ADMIN_USERNAME) && secretEqual(password, env.ADMIN_PASSWORD);
}

export async function login(username: string, password: string): Promise<boolean> {
  if (!credentialsMatch(username, password)) return false;

  const env = getEnv();
  const token = await createSessionToken(
    { sub: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
    env.SESSION_SECRET,
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return true;
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const env = getEnv();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  return verifySessionToken(token, env.SESSION_SECRET);
}

/** Throws a redirect to `/login` when the request is not authenticated. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    const headerStore = await headers();
    const path = headerStore.get("x-pathname") ?? "/";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  return session;
}

/** Actor label stored on review decisions and audit events. */
export function actorName(session: SessionPayload | null): string | null {
  return session?.sub ?? null;
}
