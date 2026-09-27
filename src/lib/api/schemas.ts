import { z } from "zod";

/** Request schemas. Every API body/query is parsed before use. */

export const LoginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

const CanonicalFieldKey = z.string().min(1).max(120);

export const MappingSchema = z.object({
  mapping: z.record(CanonicalFieldKey, z.string().max(120).nullable()),
  /** Explicit operator confirmation (ambiguous mappings need it). */
  confirmed: z.boolean().optional().default(false),
  /** Optional re-label of the source headers (not used in V1, reserved). */
  sourceHeaders: z.array(z.string().max(300)).max(200).optional(),
});

export const CommitSchema = z.object({
  includeExistingEmailRows: z.boolean().optional().default(false),
});

export const PREVIEW_FILTERS = [
  "all",
  "valid",
  "invalid",
  "duplicate",
  "imported",
  "pending",
] as const;

export const PreviewQuerySchema = z.object({
  filter: z.enum(PREVIEW_FILTERS).optional().default("all"),
  page: z.coerce.number().int().min(1).max(100_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const EMAIL_STATUS_FILTERS = ["all", "VALID", "INVALID", "UNKNOWN", "MISSING"] as const;
export const OUTREACH_STATUS_FILTERS = [
  "all",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUPPRESSED",
] as const;

export const LeadListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  batchId: z.string().max(60).optional(),
  genre: z.string().max(200).optional(),
  emailStatus: z.enum(EMAIL_STATUS_FILTERS).optional(),
  outreachStatus: z.enum(OUTREACH_STATUS_FILTERS).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const SUPPRESSION_REASONS = [
  "MANUAL",
  "UNSUBSCRIBE",
  "PREVIOUS_CLIENT",
  "DUPLICATE",
  "INVALID",
  "DO_NOT_CONTACT",
] as const;

export const OUTREACH_ACTIONS = ["approve", "reject", "suppress", "unsuppress", "reset"] as const;

export const DecisionSchema = z.object({
  personIds: z.array(z.string().min(1).max(60)).min(1).max(5000),
  action: z.enum(OUTREACH_ACTIONS),
  reason: z.enum(SUPPRESSION_REASONS).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  /** Server computed selection (filter scope) instead of explicit ids. */
  filters: z
    .object({
      search: z.string().max(200).optional(),
      batchId: z.string().max(60).optional(),
      genre: z.string().max(200).optional(),
      emailStatus: z.enum(EMAIL_STATUS_FILTERS).optional(),
      outreachStatus: z.enum(OUTREACH_STATUS_FILTERS).optional(),
    })
    .optional(),
  confirmCount: z.number().int().min(1).max(5000).optional(),
});

export const LeadEditSchema = z.object({
  email: z.string().max(320).nullable().optional(),
  firstName: z.string().max(200).nullable().optional(),
  lastName: z.string().max(200).nullable().optional(),
  fullName: z.string().max(300).nullable().optional(),
  penName: z.string().max(300).nullable().optional(),
  organization: z.string().max(300).nullable().optional(),
  role: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  websiteUrl: z.string().max(1000).nullable().optional(),
  twitterUrl: z.string().max(1000).nullable().optional(),
  instagramUrl: z.string().max(1000).nullable().optional(),
  facebookUrl: z.string().max(1000).nullable().optional(),
  linkedinUrl: z.string().max(1000).nullable().optional(),
  tiktokUrl: z.string().max(1000).nullable().optional(),
  goodreadsUrl: z.string().max(1000).nullable().optional(),
});

export const EXPORT_SCOPES = ["default", "all", "filtered", "selected"] as const;
export const EXPORT_FORMATS = ["csv", "xlsx"] as const;

export const ExportRequestSchema = z.object({
  scope: z.enum(EXPORT_SCOPES).optional().default("default"),
  personIds: z.array(z.string().min(1).max(60)).max(10_000).optional(),
  filters: z
    .object({
      search: z.string().max(200).optional(),
      batchId: z.string().max(60).optional(),
      genre: z.string().max(200).optional(),
      emailStatus: z.enum(EMAIL_STATUS_FILTERS).optional(),
      outreachStatus: z.enum(OUTREACH_STATUS_FILTERS).optional(),
    })
    .optional(),
  bookSelection: z.enum(["primary", "all"]).optional().default("primary"),
  format: z.enum(EXPORT_FORMATS).optional().default("csv"),
  optionalColumns: z
    .array(z.enum(["Organization", "Role", "BookSubtitle", "Website", "BookFormat", "Language"]))
    .optional(),
  includeIds: z.boolean().optional().default(false),
  includeProvenance: z.boolean().optional().default(true),
  kind: z.enum(["gmass", "general"]).optional().default("gmass"),
});

