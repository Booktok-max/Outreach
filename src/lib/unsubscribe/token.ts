import { createHash, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";

export interface UnsubscribeTokenPayload {
  pid: string;
  ctx?: string | null;
  iat?: number;
  exp?: number;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function signingKey(): Promise<CryptoKey> {
  const secret = getEnv().SESSION_SECRET;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index]! ^ b[index]!;
  }
  return diff === 0;
}

export async function createUnsubscribeToken(
  personId: string,
  options: { campaign?: string | null; expiresInDays?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: UnsubscribeTokenPayload = {
    pid: personId,
    iat: now,
  };
  if (options.campaign) payload.ctx = options.campaign;
  if (options.expiresInDays && options.expiresInDays > 0) {
    payload.exp = now + Math.floor(options.expiresInDays * 24 * 60 * 60);
  }

  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await signingKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toBase64Url(signature)}`;
}

export async function verifyUnsubscribeToken(
  token: string | null | undefined,
): Promise<UnsubscribeTokenPayload | null> {
  if (!token || typeof token !== "string") return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!body || !signature) return null;

  if (token.length > 4096) return null;

  try {
    const key = await signingKey();
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
    const provided = fromBase64Url(signature);
    if (!constantTimeEqual(expected, provided)) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Partial<UnsubscribeTokenPayload>;

    if (typeof payload.pid !== "string" || payload.pid.length === 0 || payload.pid.length > 80) return null;
    if (payload.ctx !== undefined && payload.ctx !== null && typeof payload.ctx !== "string") return null;
    if (payload.iat !== undefined && typeof payload.iat !== "number") return null;
    if (payload.exp !== undefined) {
      if (typeof payload.exp !== "number") return null;
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp <= now) return null;
    }

    return {
      pid: payload.pid,
      ctx: payload.ctx ?? null,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}