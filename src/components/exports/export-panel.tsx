"use client";

import { Download, Loader2 } from "lucide-react";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/lib/utils";

export interface ExportSummaryDto {
  ready: number;
  reviewed: number;
  valid: number;
  invalidEmail: number;
  suppressed: number;
  rejected: number;
  missingEmail: number;
}

const OPTIONAL_COLUMNS = [
  "Organization",
  "Role",
  "BookSubtitle",
  "Website",
  "BookFormat",
  "Language",
] as const;

type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

/**
 * Export screen.
 *
 * The confirmation panel always shows what will be exported *before* the file
 * is generated: ready contacts, valid, suppressed, rejected and missing email.
 * The GMass export defaults to APPROVED + VALID + NOT SUPPRESSED.
 */
export function ExportPanel({ initialScope = "default" }: { initialScope?: string }) {
  const [scope, setScope] = React.useState(initialScope);
  const [bookSelection, setBookSelection] = React.useState<"primary" | "all">("primary");
  const [format, setFormat] = React.useState<"csv" | "xlsx">("csv");
  const [optional, setOptional] = React.useState<OptionalColumn[]>([]);
  const [includeIds, setIncludeIds] = React.useState(false);
  const [includeProvenance, setIncludeProvenance] = React.useState(true);
  const [summary, setSummary] = React.useState<ExportSummaryDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<"gmass" | "general" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/exports?scope=${encodeURIComponent(scope)}`)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setError("The export summary could not be loaded.");
          return;
        }
        setSummary((await response.json()) as ExportSummaryDto);
      })
      .catch(() => {
        if (!cancelled) setError("The server could not be reached.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope]);

  async function download(kind: "gmass" | "general") {
    setBusy(kind);
    setError(null);

    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          scope,
          bookSelection,
          format,
          optionalColumns: kind === "gmass" ? optional : undefined,
          includeIds: kind === "general" ? includeIds : false,
          includeProvenance,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "The export could not be generated.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `outreach-${kind}-${new Date().toISOString().slice(0, 10)}.${
        format === "xlsx" ? "xlsx" : "csv"
      }`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("The export could not be downloaded.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-scope">Scope</Label>
          <Select
            id="export-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="default">Approved + valid email + not suppressed (default)</option>
            <option value="all">All contacts</option>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            The default filter is the only one that guarantees suppressed contacts are excluded.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="book-selection">Books per contact</Label>
          <Select
            id="book-selection"
            value={bookSelection}
            onChange={(event) => setBookSelection(event.target.value as "primary" | "all")}
          >
            <option value="primary">Primary book only (one row per contact)</option>
            <option value="all">All books (one row per relationship)</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="export-format">Format</Label>
          <Select
            id="export-format"
            value={format}
            onChange={(event) => setFormat(event.target.value as "csv" | "xlsx")}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </Select>
        </div>
      </div>

      <Alert variant="info">
        <AlertTitle>
          {loading
            ? "Calculating export…"
            : `Ready to export: ${formatNumber(summary?.ready ?? 0)} contacts`}
        </AlertTitle>
        <AlertDescription>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Counting matching records…
            </span>
          ) : (
            <span className="flex flex-wrap gap-4 tabular-nums">
              <span>Valid: {formatNumber(summary?.valid ?? 0)}</span>
              <span>Suppressed: {formatNumber(summary?.suppressed ?? 0)}</span>
              <span>Rejected: {formatNumber(summary?.rejected ?? 0)}</span>
              <span>Missing email: {formatNumber(summary?.missingEmail ?? 0)}</span>
              <span>Invalid email: {formatNumber(summary?.invalidEmail ?? 0)}</span>
              <span>Pool: {formatNumber(summary?.reviewed ?? 0)}</span>
            </span>
          )}
        </AlertDescription>
      </Alert>

      <div>
        <p className="mb-2 text-xs font-medium">GMass export columns (required)</p>
        <ul className="flex flex-wrap gap-2 text-[11px]">
          {[
            "Email",
            "FirstName",
            "LastName",
            "AuthorName",
            "BookTitle",
            "SeriesName",
            "Genre",
            "BookURL",
            "AmazonURL",
          ].map((header) => (
            <li key={header} className="rounded-sm bg-muted px-2 py-0.5">
              {header}
            </li>
          ))}
        </ul>

        <p className="mb-2 mt-3 text-xs font-medium">Additional columns (opt in)</p>
        <div className="flex flex-wrap gap-3">
          {OPTIONAL_COLUMNS.map((column) => (
            <label key={column} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={optional.includes(column)}
                onChange={(event) =>
                  setOptional((current) =>
                    event.target.checked
                      ? [...current, column]
                      : current.filter((value) => value !== column),
                  )
                }
              />
              {column}
            </label>
          ))}
        </div>

        <p className="mb-2 mt-3 text-xs font-medium">General export options</p>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={includeProvenance}
              onChange={(event) => setIncludeProvenance(event.target.checked)}
            />
            Include source file / row / import date (general export only)
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={includeIds}
              onChange={(event) => setIncludeIds(event.target.checked)}
            />
            Include internal database ids (general export only)
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button onClick={() => download("gmass")} disabled={busy !== null}>
          {busy === "gmass" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {busy === "gmass" ? "Generating…" : "Download GMass export"}
        </Button>
        <Button variant="outline" onClick={() => download("general")} disabled={busy !== null}>
          {busy === "general" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {busy === "general" ? "Generating…" : "Download full canonical export"}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cells starting with =, +, - or @ are prefixed with an apostrophe in every export so
        spreadsheet formulas can never be injected. Internal ids and raw import metadata are never
        part of the GMass file.
      </p>
    </div>
  );
}

