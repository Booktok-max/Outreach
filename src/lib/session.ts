/**
 * Signed session token.
 *
 * Edge-runtime safe (Web Crypto only) so `middleware.ts` can verify the cookie
 * before a request ever reaches a page or an API route. The token is a
 * base64url JSON payload plus an HMAC-SHA256 signature.
 */

const encoder = new TextEncoder();

export interface SessionPayload {
  /** Operator username. */
  sub: string;
  /** Expiry as unix seconds. */
  exp: number;
}

export const SESSION_COOKIE = "outreach_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;


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

async function importKey(secret: string): Promise<CryptoKey> {
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

export async function createSessionToken(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!body || !signature) return null;

  try {
    const key = await importKey(secret);
    const expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(body)),
    );
    const provided = fromBase64Url(signature);

    if (!constantTimeEqual(expected, provided)) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(body)),
    ) as Partial<SessionPayload>;

    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= nowSeconds) return null;

    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}
