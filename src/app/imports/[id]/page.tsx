import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { BatchStatusBadge } from "@/components/status-badges";
import { ImportActions } from "@/components/import/import-actions";
import { ImportRowExport } from "@/components/import/import-row-export";
import { PreviewTable } from "@/components/import/preview-view";
import { ReviewCard } from "@/components/import/review-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { getBatchSummary } from "@/lib/import/validation-service";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Import detail" };

/** `/imports/[id]` - full lifecycle view of one staged upload. */
export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const batch = await prisma.importBatch.findUnique({
    where: { id },
    select: {
      id: true,
      filename: true,
      fileType: true,
      fileSize: true,
      fileChecksum: true,
      sheetName: true,
      status: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      duplicateRows: true,
      importedRows: true,
      skippedRows: true,
      rowLimitExceeded: true,
      columnMapping: true,
      detectedColumns: true,
      validatedAt: true,
      importedAt: true,
      failureMessage: true,
      createdBy: true,
      createdAt: true,
    },
  });

  if (!batch) notFound();

  const summary = await getBatchSummary(id);

  const detections =
    (batch.detectedColumns as
      | Array<{ sourceHeader: string; suggestion: string | null; confidence: number }>
      | null) ?? [];
  const mapping = (batch.columnMapping as Record<string, string | null> | null) ?? {};
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader
        title={batch.filename}
        description={`${batch.fileType} · ${formatNumber(batch.totalRows)} rows · uploaded ${formatDateTime(batch.createdAt)}`}
        actions={
          <>
            <BatchStatusBadge status={batch.status} />
            <Link
              href="/imports"
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              All imports
            </Link>
          </>
        }
      />

      {batch.failureMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{batch.failureMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>File</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs">
            <MetaRow label="Type" value={`${batch.fileType}${batch.sheetName ? ` · ${batch.sheetName}` : ""}`} />
            <MetaRow label="Size" value={formatBytes(batch.fileSize)} />
            <MetaRow
              label="Checksum"
              value={batch.fileChecksum ? `${batch.fileChecksum.slice(0, 16)}…` : "—"}
            />
            <MetaRow label="Uploaded by" value={batch.createdBy ?? "—"} />
            <MetaRow
              label="Mapping"
              value={`${mappedCount} of ${detections.length} columns mapped`}
            />
            {batch.validatedAt ? (
              <MetaRow label="Validated" value={formatDateTime(batch.validatedAt)} />
            ) : null}
            {batch.importedAt ? (
              <MetaRow label="Imported" value={formatDateTime(batch.importedAt)} />
            ) : null}
            {batch.rowLimitExceeded ? (
              <p className="text-warning">Row limit reached - the file was truncated.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Counts</CardTitle>
            <CardDescription>What will be imported - and what will not.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ReviewCard summary={summary} />
            <ImportActions
              batchId={batch.id}
              status={batch.status}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rows</CardTitle>
          <CardDescription>
            Filter by verdict and page through the staged file. Duplicates and invalid rows stay
            here for review - they are never silently deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PreviewTable batchId={batch.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Row exports</CardTitle>
          <CardDescription>
            Export a single source row or the whole staged file for offline review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportRowExport batchId={batch.id} filename={batch.filename} />
        </CardContent>
      </Card>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
