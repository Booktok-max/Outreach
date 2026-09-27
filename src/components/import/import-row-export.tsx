"use client";

import { CircleAlert, Download } from "lucide-react";
import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/utils";

export interface ImportDetail {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  status: string;
  totalRows: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The row could not be exported.";
}

/**
 * Exports one import row (or the whole file) to CSV/XLSX.
 * Invalid and duplicate rows stay reviewable - they are never silently dropped.
 */
export function ImportRowExport({ batchId, filename }: { batchId: string; filename: string }) {
  const [rowNumber, setRowNumber] = React.useState("");
  const [format, setFormat] = React.useState<"csv" | "xlsx">("csv");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function download(payload: { rowNumber?: number; format: "csv" | "xlsx" }) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/imports/${batchId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Export failed.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${filename}.${payload.format === "xlsx" ? "xlsx" : "csv"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="row-number">Source row</Label>
          <Input
            id="row-number"
            inputMode="numeric"
            placeholder="e.g. 42"
            value={rowNumber}
            onChange={(event) => setRowNumber(event.target.value)}
            className="w-28"
          />
        </div>

        <div className="flex gap-1" role="group" aria-label="Format">
          {(["csv", "xlsx"] as const).map((option) => (
            <Button
              key={option}
              variant={format === option ? "default" : "outline"}
              size="sm"
              onClick={() => setFormat(option)}
            >
              {option.toUpperCase()}
            </Button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={busy || rowNumber.trim().length === 0}
          onClick={() => {
            const parsed = Number.parseInt(rowNumber, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
              setError("Enter a valid 1-based row number.");
              return;
            }
            void download({ rowNumber: parsed, format });
          }}
        >
          <Download className="size-3.5" />
          {busy ? "Working…" : "Export row"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void download({ format })}
          title="Exports every staged row of this import (raw + normalized values)"
        >
          <Download className="size-3.5" />
          {busy ? "Working…" : "Export all rows"}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Full-file exports are capped at {formatNumber(20_000)} rows.
      </p>
    </div>
  );
}
