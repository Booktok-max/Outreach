"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FIELD_OPTIONS } from "@/components/import/field-options";
import { ImportActions } from "@/components/import/import-actions";
import { MappingEditor } from "@/components/import/mapping-editor";
import { PreviewTable, usePreview } from "@/components/import/preview-view";
import { formatNumber } from "@/lib/utils";

import type { MapStepData } from "@/components/import/wizard";

function ValidateButton({ batchId, onValidated }: { batchId: string; onValidated: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/imports/${batchId}/validate`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Validation failed.");
        return;
      }
      onValidated();
    } catch {
      setError("The server could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <button
        type="button"
        onClick={validate}
        disabled={busy}
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Validate rows"}
      </button>
    </div>
  );
}

/**
 * The `?batch=…` step of the wizard: mapping editor + validate + preview +
 * import controls for one staged batch.
 */
export function MapStepCard({ data }: { data: MapStepData }) {
  const router = useRouter();
  const { payload, loading, reload } = usePreview(data.batchId, 1);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{data.filename}</CardTitle>
              <CardDescription>
                {formatNumber(data.totalRows)} rows staged · review the column mapping, then
                validate and import.
              </CardDescription>
            </div>
            <ValidateButton
              batchId={data.batchId}
              onValidated={() => {
                reload();
                router.refresh();
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <MappingEditor
            batchId={data.batchId}
            headers={data.headers}
            detections={data.detectedColumns}
            initialMapping={data.mapping}
            fieldOptions={FIELD_OPTIONS}
            onSaved={() => reload()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validate & review</CardTitle>
          <CardDescription>
            Validation and de-duplication run server side. Only valid rows can be imported.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading && !payload ? (
            <p className="text-sm text-muted-foreground">
              Nothing validated yet - press “Validate rows” above.
            </p>
          ) : (
            <PreviewTable batchId={data.batchId} />
          )}
          <ImportActions
            batchId={data.batchId}
            status={payload?.status ?? "MAPPED"}
            onChanged={() => {
              reload();
              router.refresh();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
