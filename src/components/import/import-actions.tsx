"use client";

import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePreview } from "@/components/import/preview-table";
import { formatNumber } from "@/lib/utils";

export interface ImportActionsProps {
  batchId: string;
  status: string;
  onChanged?: () => void;
}

export interface ImportResult {
  status: "imported" | "partial" | "failed" | "nothing_to_import";
  importedRows: number;
  createdPeople: number;
  createdBooks: number;
  linkedRelationships: number;
  skippedRows: number;
  failureMessage: string | null;
}

export type ImportBusyAction = "validate" | "import" | "cancel" | null;

/**
 * Validate / import / cancel controls for a staged import.
 * Import always needs an explicit confirmation showing what will be written;
 * duplicates stay out unless the operator opts in.
 */
export function ImportActions({ batchId, status, onChanged }: ImportActionsProps) {
  const [busy, setBusy] = React.useState<ImportBusyAction>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [includeExisting, setIncludeExisting] = React.useState(false);

  const { payload, loading } = usePreview(batchId, 1);
  const summary = payload?.summary ?? null;

  async function validate() {
    setBusy("validate");
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/imports/${batchId}/validate`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Validation could not be completed.");
        return;
      }
      onChanged?.();
    } catch {
      setError("The server could not be reached.");
    } finally {
      setBusy(null);
    }
  }

  async function doImport() {
    setBusy("import");
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/imports/${batchId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeExistingEmailRows: includeExisting }),
      });
      const body = (await response.json().catch(() => null)) as
        | (ImportResult & { error?: string })
        | null;
      if (!response.ok) {
        setError(body?.error ?? "The import could not be completed.");
        setConfirmOpen(false);
        return;
      }
      if (body) setResult(body);
      setConfirmOpen(false);
      onChanged?.();
    } catch {
      setError("The server could not be reached.");
      setConfirmOpen(false);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    setError(null);
    try {
      const response = await fetch(`/api/imports/${batchId}/cancel`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "The import could not be cancelled.");
        return;
      }
      onChanged?.();
    } catch {
      setError("The server could not be reached.");
    } finally {
      setBusy(null);
    }
  }

  const finished = status === "IMPORTED" || status === "CANCELLED" || status === "FAILED";
  const validated = status === "VALIDATED";
  const validCount = summary?.valid ?? 0;
  const dupeExisting = summary?.duplicateBreakdown?.EMAIL_EXISTING ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <Alert variant={result.status === "failed" ? "destructive" : "success"}>
          <AlertTitle>{resultTitle(result.status)}</AlertTitle>
          <AlertDescription>
            <span className="tabular-nums">
              {formatNumber(result.importedRows)} rows written ·{" "}
              {formatNumber(result.createdPeople)} new contacts ·{" "}
              {formatNumber(result.createdBooks)} new books
            </span>
            {result.failureMessage ? (
              <span className="mt-1 block">{result.failureMessage}</span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!finished ? (
          <Button variant="outline" onClick={validate} disabled={busy !== null || loading}>
            {busy === "validate" ? "Validating…" : "Validate rows"}
          </Button>
        ) : null}

        {validated && validCount > 0 ? (
          <Button onClick={() => setConfirmOpen(true)} disabled={busy !== null}>
            Import {formatNumber(validCount)} valid row{validCount === 1 ? "" : "s"}
          </Button>
        ) : null}

        {!finished ? (
          <Button variant="ghost" onClick={cancel} disabled={busy !== null}>
            {busy === "cancel" ? "Cancelling…" : "Cancel import"}
          </Button>
        ) : null}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm import"
        description={`Write ${formatNumber(validCount)} valid rows into the database.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy !== null}>
              Back
            </Button>
            <Button onClick={doImport} disabled={busy !== null}>
              {busy === "import" ? "Importing…" : `Import ${formatNumber(validCount)} rows`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          {summary ? (
            <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Valid</dt>
                <dd className="font-semibold tabular-nums text-success">
                  {formatNumber(summary.valid)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Invalid (not imported)</dt>
                <dd className="font-semibold tabular-nums text-destructive">
                  {formatNumber(summary.invalid)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duplicate (not imported)</dt>
                <dd className="font-semibold tabular-nums text-warning">
                  {formatNumber(summary.duplicate)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total rows</dt>
                <dd className="font-semibold tabular-nums">
                  {formatNumber(summary.totalRows)}
                </dd>
              </div>
            </dl>
          ) : null}

          {dupeExisting > 0 ? (
            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox
                id="include-existing"
                checked={includeExisting}
                onChange={(event) => setIncludeExisting(event.target.checked)}
              />
              <Label htmlFor="include-existing" className="text-xs leading-relaxed">
                Also import {formatNumber(dupeExisting)} row
                {dupeExisting === 1 ? "" : "s"} whose email already exists, attaching new books
                to the existing contact
              </Label>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Invalid and duplicate rows are kept for review - only valid rows are written.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

function resultTitle(status: ImportResult["status"]): string {
  switch (status) {
    case "imported":
      return "Import complete";
    case "partial":
      return "Import partially complete";
    case "failed":
      return "Import failed";
    default:
      return "Nothing to import";
  }
}


