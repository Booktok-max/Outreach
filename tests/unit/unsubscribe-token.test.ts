import { beforeEach, describe, expect, it } from "vitest";

import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/unsubscribe/token";

beforeEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://ci:ci@127.0.0.1:5432/ci_placeholder";
  process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "ci";
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ci";
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "ci_only_placeholder_secret_not_a_real_credential";
});

describe("unsubscribe tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await createUnsubscribeToken("person-123", { campaign: "spring" });
    const payload = await verifyUnsubscribeToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.pid).toBe("person-123");
    expect(payload?.ctx).toBe("spring");
  });

  it("rejects a malformed token", async () => {
    expect(await verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(await verifyUnsubscribeToken("")).toBeNull();
    expect(await verifyUnsubscribeToken(null)).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await createUnsubscribeToken("person-123");
    const [body, signature] = token.split(".");
    const tamperedBody = `${body}x`;
    expect(await verifyUnsubscribeToken(`${tamperedBody}.${signature}`)).toBeNull();
  });

  it("rejects a token retargeted to another contact", async () => {
    const token = await createUnsubscribeToken("person-123");
    const [body, signature] = token.split(".");
    // Re-encode a different person id while keeping the original signature.
    const decoded = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    decoded.pid = "person-999";
    const newBody = Buffer.from(JSON.stringify(decoded)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyUnsubscribeToken(`${newBody}.${signature}`)).toBeNull();
  });
});