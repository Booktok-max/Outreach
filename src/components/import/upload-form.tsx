"use client";

import { Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface StageResponse {
  outcome: "staged";
  batchId: string;
}

interface SheetSelectionResponse {
  outcome: "sheet_selection_required";
  sheetNames: string[];
  fileType: string;
}

const MAX_CLIENT_BYTES = 25 * 1024 * 1024;

/**
 * Step 1 of the import wizard: file upload (+ worksheet selection for XLSX).
 * The server responds with 409 when a workbook needs a sheet choice; the file
 * is kept in memory and re-uploaded with the selection - no batch is created
 * before the operator picks a sheet.
 */
export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sheetNames, setSheetNames] = React.useState<string[]>([]);
  const [sheetName, setSheetName] = React.useState("");

  async function submit(selectedSheet?: string) {
    if (!file) {
      setError("Choose a .csv or .xlsx file first.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (selectedSheet) form.append("sheetName", selectedSheet);

      const response = await fetch("/api/imports", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as
        | (StageResponse & { error?: string })
        | (SheetSelectionResponse & { error?: string })
        | { error?: string }
        | null;

      if (response.status === 409 && body && "outcome" in body && body.outcome === "sheet_selection_required") {
        setSheetNames(body.sheetNames ?? []);
        setSheetName((body.sheetNames ?? [])[0] ?? "");
        setError(null);
        return;
      }

      if (!response.ok || !body || !("batchId" in body)) {
        setError(
          (body as { error?: string } | null)?.error ?? "The file could not be staged.",
        );
        return;
      }

      router.push(`/imports/new?batch=${encodeURIComponent(body.batchId)}&step=map`);
      router.refresh();
    } catch {
      setError("The server could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="import-file">Source file (.csv or .xlsx)</Label>
        <Input
          id="import-file"
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setSheetNames([]);
            setSheetName("");
            setError(null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Quoted values, commas inside descriptions, Unicode, blank cells and escaped quotes are
          all supported. Up to ~5,000 rows comfortably; hard limit 20,000 rows / 10&nbsp;MB.
        </p>
      </div>

      {sheetNames.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-md border p-3">
          <Label htmlFor="worksheet">Worksheet (this workbook has several)</Label>
          <Select
            id="worksheet"
            value={sheetName}
            onChange={(event) => setSheetName(event.target.value)}
          >
            {sheetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div>
        {sheetNames.length > 0 ? (
          <Button onClick={() => submit(sheetName)} disabled={busy || !file}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {busy ? "Staging…" : `Stage worksheet "${sheetName}"`}
          </Button>
        ) : (
          <Button onClick={() => submit(undefined)} disabled={busy || !file}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {busy ? "Staging…" : "Upload & inspect columns"}
          </Button>
        )}
      </div>

      {file && file.size > MAX_CLIENT_BYTES ? (
        <Alert variant="warning">
          <AlertDescription>
            This file is large; older browsers may struggle to upload it. Prefer the desktop import
            or split the file.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
