"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface LeadEditValues {
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  penName: string;
  organization: string;
  role: string;
  notes: string;
  websiteUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  linkedinUrl: string;
  tiktokUrl: string;
  goodreadsUrl: string;
}

const TEXT_FIELDS: Array<{ key: keyof LeadEditValues; label: string }> = [
  { key: "fullName", label: "Full name" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "penName", label: "Author / pen name" },
  { key: "organization", label: "Organization" },
  { key: "role", label: "Role" },
];

const URL_FIELDS: Array<{ key: keyof LeadEditValues; label: string }> = [
  { key: "websiteUrl", label: "Website" },
  { key: "twitterUrl", label: "X / Twitter" },
  { key: "instagramUrl", label: "Instagram" },
  { key: "facebookUrl", label: "Facebook" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "tiktokUrl", label: "TikTok" },
  { key: "goodreadsUrl", label: "Goodreads" },
];

/**
 * Record editing. Values are validated server side (email syntax + uniqueness,
 * URL structure) and derived caches are refreshed by the API.
 */
export function LeadEditForm({ personId, initial }: { personId: string; initial: LeadEditValues }) {
  const router = useRouter();
  const [values, setValues] = React.useState<LeadEditValues>(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issues, setIssues] = React.useState<Array<{ field: string; message: string }>>([]);
  const [saved, setSaved] = React.useState(false);

  function update(key: keyof LeadEditValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssues([]);
    setSaved(false);

    const payload: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(values)) {
      payload[key] = value.trim().length > 0 ? value.trim() : null;
    }

    try {
      const response = await fetch(`/api/leads/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        details?: { issues?: Array<{ field: string; message: string }> };
      } | null;

      if (!response.ok) {
        setError(body?.error ?? "The record could not be saved.");
        setIssues(body?.details?.issues ?? []);
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("The server could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  const issueFor = (key: string) => issues.find((issue) => issue.field === key)?.message ?? null;

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {issues.length > 0 ? (
              <ul className="mt-1 list-disc pl-4">
                {issues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`}>
                    {issue.field}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {saved ? (
        <Alert variant="success">
          <AlertDescription>Record updated.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Email" hint="Normalized to lowercase. Must be unique across contacts.">
          <Input
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            inputMode="email"
            autoComplete="off"
          />
          {issueFor("email") ? (
            <span className="text-[11px] text-destructive">{issueFor("email")}</span>
          ) : null}
        </Field>

        {TEXT_FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            <Input
              value={values[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
            />
          </Field>
        ))}

        {URL_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint="https:// is added automatically">
            <Input
              value={values[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
            />
            {issueFor(field.key) ? (
              <span className="text-[11px] text-destructive">{issueFor(field.key)}</span>
            ) : null}
          </Field>
        ))}
      </div>

      <Field label="Notes">
        <Textarea
          value={values.notes}
          maxLength={5000}
          onChange={(event) => update("notes", event.target.value)}
        />
      </Field>

      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
