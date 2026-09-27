"use client";

import { AlertTriangle, CheckCircle2, Loader2, ShieldQuestion } from "lucide-react";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ColumnDetectionDto {
  sourceHeader: string;
  suggestion: string | null;
  confidence: number;
  level: "high" | "medium" | "low" | "none";
  ambiguous: boolean;
  conflict: boolean;
  requiresConfirmation: boolean;
  reason: string;
  alternatives: Array<{ field: string; confidence: number; reason: string }>;
}

export interface MappingEditorProps {
  batchId: string;
  headers: string[];
  detections: ColumnDetectionDto[];
  initialMapping: Record<string, string | null>;
  /** Canonical field options (label/value/group) for the dropdowns. */
  fieldOptions: Array<{ value: string; label: string; group: string }>;
  /** Called after a successful save (e.g. to advance the wizard). */
  onSaved?: (mapping: Record<string, string | null>) => void;
  /** When false the component renders a read-only summary. */
  editable?: boolean;
}

const LEVEL_BADGE: Record<ColumnDetectionDto["level"], { className: string; label: string }> = {
  high: { className: "bg-success text-success-foreground", label: "High" },
  medium: { className: "bg-warning text-warning-foreground", label: "Medium" },
  low: { className: "bg-muted text-muted-foreground", label: "Low" },
  none: { className: "bg-destructive text-destructive-foreground", label: "Unmapped" },
};

/**
 * Step 2 of the import wizard: review and adjust the suggested column mapping.
 * Ambiguous columns are highlighted and must be confirmed explicitly.
 */
export function MappingEditor({
  batchId,
  headers,
  detections,
  initialMapping,
  fieldOptions,
  onSaved,
  editable = true,
}: MappingEditorProps) {
  const [mapping, setMapping] = React.useState<Record<string, string | null>>(initialMapping);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [saved, setSaved] = React.useState(false);

  const detectionByHeader = React.useMemo(() => {
    const map = new Map<string, ColumnDetectionDto>();
    for (const detection of detections) map.set(detection.sourceHeader, detection);
    return map;
  }, [detections]);

  const groupedOptions = React.useMemo(() => {
    const groups = new Map<string, Array<{ value: string; label: string }>>();
    for (const option of fieldOptions) {
      const list = groups.get(option.group) ?? [];
      list.push({ value: option.value, label: option.label });
      groups.set(option.group, list);
    }
    return Array.from(groups.entries());
  }, [fieldOptions]);

  const ambiguousCount = detections.filter(
    (detection) => detection.ambiguous || detection.conflict,
  ).length;
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  async function save() {
    setBusy(true);
    setErrors([]);
    setWarnings([]);

    try {
      const response = await fetch(`/api/imports/${batchId}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping, confirmed: true }),
      });

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        details?: {
          errors?: Array<{ message: string }>;
          warnings?: Array<{ message: string }>;
        };
      } | null;

      if (!response.ok) {
        const detailErrors = body?.details?.errors?.map((issue) => issue.message) ?? [];
        setErrors(
          detailErrors.length > 0
            ? detailErrors
            : [body?.error ?? "The mapping could not be saved."],
        );
        return;
      }

      setWarnings(body?.details?.warnings?.map((issue) => issue.message) ?? []);
      setSaved(true);
      onSaved?.(mapping);
    } catch {
      setErrors(["The server could not be reached. Try again."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{headers.length}</strong> columns detected
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-foreground">{mappedCount}</strong> mapped
          </span>
          {ambiguousCount > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <Badge className="border-transparent bg-warning text-warning-foreground">
                {ambiguousCount} need confirmation
              </Badge>
            </>
          ) : null}
        </div>

        {editable ? (
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Saving…" : "Confirm mapping & continue"}
          </Button>
        ) : null}
      </div>

      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Mapping needs attention</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {saved ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>Mapping confirmed. Continue to validation below.</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[26%]">Source column</TableHead>
              <TableHead className="w-[30%]">Canonical field</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {headers.map((header) => {
              const detection = detectionByHeader.get(header);
              const level = detection?.level ?? "none";
              const badge = LEVEL_BADGE[level];
              const percent = Math.round((detection?.confidence ?? 0) * 100);
              const needsAttention = Boolean(detection?.ambiguous || detection?.conflict);

              return (
                <TableRow key={header} className={needsAttention ? "bg-warning/10" : undefined}>
                  <TableCell className="font-medium">
                    <span className="block truncate" title={header}>
                      {header}
                    </span>
                  </TableCell>

                  <TableCell>
                    {editable ? (
                      <Select
                        aria-label={`Canonical field for ${header}`}
                        value={mapping[header] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setMapping((current) => ({
                            ...current,
                            [header]: value.length > 0 ? value : null,
                          }));
                          setSaved(false);
                        }}
                      >
                        <option value="">— Ignore this column —</option>
                        {groupedOptions.map(([group, options]) => (
                          <optgroup key={group} label={group}>
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-sm">
                        {mapping[header] ? (
                          fieldOptions.find((option) => option.value === mapping[header])?.label
                        ) : (
                          <span className="text-muted-foreground">Ignored</span>
                        )}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge className={`border-transparent ${badge.className}`}>
                      {badge.label}
                      {level !== "none" ? ` ${percent}%` : ""}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    <span className="flex items-start gap-1">
                      {needsAttention ? (
                        <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      ) : detection?.suggestion ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                      ) : null}
                      <span>{detection?.reason ?? "No confident match - choose manually."}</span>
                    </span>
                    {needsAttention && detection ? (
                      <span className="mt-1 block text-[11px]">
                        Candidates:{" "}
                        {detection.alternatives
                          .slice(0, 2)
                          .map(
                            (alternative) =>
                              `${alternative.field} (${Math.round(alternative.confidence * 100)}%)`,
                          )
                          .join(" · ")}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}

