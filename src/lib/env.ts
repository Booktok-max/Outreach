import { z } from "zod";

/**
 * Environment configuration.
 *
 * Parsed lazily so that pure modules (parsers, mapping, validation, export)
 * can be unit-tested without a database or admin credentials present. Secrets
 * are only ever read on the server.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  ADMIN_USERNAME: z.string().min(1, "ADMIN_USERNAME is required"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters"),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_IMPORT_ROWS: z.coerce.number().int().positive().default(20_000),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    // Never echo the values themselves - only the failing variable names.
    throw new Error(`Invalid server environment configuration -> ${problems}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

/** Resets the memoized environment (used by tests). */
export function resetEnvCache(): void {
  cachedEnv = null;
}
