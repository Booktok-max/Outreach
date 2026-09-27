"use client";

import { CircleAlert, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { RowStatusBadge } from "@/components/status-badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, truncate } from "@/lib/utils";

import {
  usePreview,
  type PreviewFilter,
  type PreviewRowDto,
  type PreviewSummaryDto,
} from "./preview-table";

export { usePreview, type PreviewFilter, type PreviewRowDto, type PreviewSummaryDto };

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? "—" : truncate(value, 60);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return truncate(JSON.stringify(value), 60);
  } catch {
    return "—";
  }
}

function issueTitle(issue: { field: string; code: string; message: string }): string {
  return `${issue.field}: ${issue.message} (${issue.code})`;
}

/** Compact staged-row table rendered under the filter bar. */
export function PreviewRowsTable({ rows }: { rows: PreviewRowDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Row</TableHead>
          <TableHead className="w-28">Status</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Book</TableHead>
          <TableHead>Issues</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const issues = [...(row.errors ?? []), ...(row.warnings ?? [])];
          return (
            <TableRow key={row.id}>
              <TableCell className="tabular-nums">{row.rowNumber}</TableCell>
              <TableCell>
                <RowStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="max-w-45 truncate" title={row.normalized?.email?.value ?? ""}>
                {row.normalized?.email?.value ?? "—"}
              </TableCell>
              <TableCell className="max-w-40 truncate">
                {row.normalized?.fullName ?? row.normalized?.authorName ?? "—"}
              </TableCell>
              <TableCell className="max-w-40 truncate">
                {row.normalized?.bookTitle ?? row.normalized?.seriesName ?? row.normalized?.genre ?? "—"}
              </TableCell>
              <TableCell>
                {row.duplicateMessage ? (
                  <p className="text-xs text-muted-foreground">{truncate(row.duplicateMessage, 80)}</p>
                ) : issues.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {issues.slice(0, 3).map((issue, index) => (
                      <li
                        key={`${issue.field}-${issue.code}-${index}`}
                        title={issueTitle(issue)}
                        className={cn(
                          "flex items-start gap-1 text-xs",
                          index < row.errors.length ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        <CircleAlert className="mt-0.5 size-3 shrink-0" />
                        <span className="line-clamp-2">{formatCellValue(issue.message)}</span>
                      </li>
                    ))}
                    {issues.length > 3 ? (
                      <li className="text-[11px] text-muted-foreground">+{issues.length - 3} more</li>
                    ) : null}
                  </ul>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

const FILTERS: Array<{ value: PreviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "valid", label: "Valid" },
  { value: "invalid", label: "Invalid" },
  { value: "duplicate", label: "Duplicate" },
  { value: "imported", label: "Imported" },
  { value: "pending", label: "Pending" },
];

function filterCount(summary: PreviewSummaryDto | null, filter: PreviewFilter): number | null {
  if (!summary) return null;
  switch (filter) {
    case "all":
      return summary.totalRows;
    case "valid":
      return summary.valid;
    case "invalid":
      return summary.invalid;
    case "duplicate":
      return summary.duplicate;
    case "imported":
      return summary.imported;
    case "pending":
      return summary.pending;
    default:
      return null;
  }
}

/**
 * Paginated preview of staged rows. Never loads more than one page at a time,
 * so reviewing a 5,000 row import stays responsive.
 */
export function PreviewTable({ batchId, pageSize = 25 }: { batchId: string; pageSize?: number }) {
  const { payload, loading, error, filter, page, setFilter, setPage } = usePreview(
    batchId,
    pageSize,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((option) => {
          const count = filterCount(payload?.summary ?? null, option.value);
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
                "tabular-nums",
              )}
              aria-pressed={active}
            >
              {option.label}
              {count !== null ? <span className="opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-md border">
        {loading && !payload ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading rows…
          </div>
        ) : !payload || payload.rows.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            No rows match this filter.
          </p>
        ) : (
          <>
            <PreviewRowsTable rows={payload.rows} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                {payload.total.toLocaleString()} row{payload.total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {payload.page.toLocaleString()} of{" "}
                  {Math.max(1, payload.totalPages).toLocaleString()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= payload.totalPages || loading}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
