"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapStepCard } from "@/components/import/map-step-card";
import { UploadForm } from "@/components/import/upload-form";

export type WizardStep = "upload" | "map" | "review";

export interface MapStepData {
  batchId: string;
  headers: string[];
  detectedColumns: Array<{
    sourceHeader: string;
    suggestion: string | null;
    confidence: number;
    level: "high" | "medium" | "low" | "none";
    ambiguous: boolean;
    conflict: boolean;
    requiresConfirmation: boolean;
    reason: string;
    alternatives: Array<{ field: string; confidence: number; reason: string }>;
  }>;
  mapping: Record<string, string | null>;
  totalRows: number;
  filename: string;
}

const STEPS: Array<{ value: WizardStep; label: string }> = [
  { value: "upload", label: "1 · Upload & inspect" },
  { value: "map", label: "2 · Map columns" },
  { value: "review", label: "3 · Validate & import" },
];

export function StepIndicator({ current }: { current: WizardStep }) {
  const order: WizardStep[] = ["upload", "map", "review"];
  const index = order.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((step, position) => {
        const active = step.value === current;
        const done = position < index;
        return (
          <li key={step.value} className="flex items-center gap-2">
            <Badge
              className={
                active
                  ? "border-transparent bg-primary text-primary-foreground"
                  : done
                    ? "border-transparent bg-success text-success-foreground"
                    : "border-border bg-muted text-muted-foreground"
              }
            >
              {step.label}
            </Badge>
            {position < STEPS.length - 1 ? (
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export { FIELD_OPTIONS } from "@/components/import/field-options";
export { ReviewCard } from "@/components/import/review-card";


/** Validation results alert for the review screen. */
export function ValidationSummaryAlert({
  summary,
}: {
  summary: { valid: number; invalid: number; duplicate: number };
}) {
  if (summary.valid === 0 && summary.invalid === 0 && summary.duplicate === 0) return null;
  return (
    <Alert>
      <AlertTitle>Validation results</AlertTitle>
      <AlertDescription>
        Valid: {summary.valid} · Invalid: {summary.invalid} · Duplicate: {summary.duplicate}
      </AlertDescription>
    </Alert>
  );
}

/** First wizard step: upload a new file. */
export function UploadStepCard() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Upload a file</CardTitle>
        <CardDescription>
          CSV or XLSX. Rows are staged for review - nothing is written to the database yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UploadForm />
      </CardContent>
    </Card>
  );
}

export function NewImportWizard({
  step,
  mapData,
}: {
  step: "upload" | "map";
  mapData?: MapStepData;
}) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <StepIndicator current={step === "upload" ? "upload" : "map"} />
      {step === "upload" || !mapData ? <UploadStepCard /> : <MapStepCard data={mapData} />}
    </div>
  );
}

