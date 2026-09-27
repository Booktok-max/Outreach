import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CANONICAL_FIELD_DEFINITIONS } from "@/lib/import/fields";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

const LIMITS = [
  ["Maximum upload size", "10 MB (MAX_UPLOAD_BYTES)"],
  ["Maximum rows per import", "20,000 (MAX_IMPORT_ROWS)"],
  ["Target dataset size for V1", "~5,000 rows"],
  ["Staged row retention", "Raw source values are kept on import_row for audit"],
  ["Session lifetime", "12 hours (signed cookie)"],
];

const ROADMAP = [
  "AI book research and enrichment",
  "AI email generation",
  "Amazon / Goodreads / BookTok lookups",
  "GMass API sending, follow-ups, tracking",
  "Suppression sync with external providers",
];

/** `/settings` - read-only operational reference for the operator. */
export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader
        title="Settings"
        description="Operational limits, canonical fields and the V1 scope. Configuration lives in the server environment."
      />

      <Card>
        <CardHeader>
          <CardTitle>Limits &amp; configuration</CardTitle>
          <CardDescription>
            Values are read from environment variables on the server - never from the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs">
          {LIMITS.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-right font-medium">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canonical fields</CardTitle>
          <CardDescription>
            The mapping engine recognises these fields, each with its own alias list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {CANONICAL_FIELD_DEFINITIONS.map((definition) => (
              <span
                key={definition.field}
                className="rounded-sm border px-2 py-0.5 text-[11px]"
                title={`${definition.description} Aliases: ${definition.aliases.slice(0, 6).join(", ")}…`}
              >
                {definition.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Out of scope for V1</CardTitle>
          <CardDescription>
            The schema and pipeline leave room for these, but they are deliberately not implemented
            yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-4 text-xs text-muted-foreground">
            {ROADMAP.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
