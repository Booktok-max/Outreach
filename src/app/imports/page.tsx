import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, Pagination } from "@/components/page-header";
import { BatchStatusBadge } from "@/components/status-badges";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Imports" };

const PAGE_SIZE = 25;

interface SearchParams {
  page?: string;
}

/** `/imports` - every staged upload with its pipeline status. */
export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const [total, batches] = await Promise.all([
    prisma.importBatch.count(),
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        filename: true,
        fileType: true,
        fileSize: true,
        status: true,
        totalRows: true,
        validRows: true,
        invalidRows: true,
        duplicateRows: true,
        importedRows: true,
        skippedRows: true,
        rowLimitExceeded: true,
        createdBy: true,
        createdAt: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Imports"
        description="Staged uploads and their progress through the pipeline."
        actions={
          <Link
            href="/imports/new"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            New import
          </Link>
        }
      />

      <Card>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No imports yet.{" "}
              <Link href="/imports/new" className="text-primary hover:underline">
                Upload your first file
              </Link>
              .
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Valid</TableHead>
                  <TableHead className="text-right">Invalid</TableHead>
                  <TableHead className="text-right">Duplicate</TableHead>
                  <TableHead className="text-right">Imported</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <Link
                        href={`/imports/${batch.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {batch.filename}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {batch.fileType} · {formatBytes(batch.fileSize)}
                        {batch.rowLimitExceeded ? " · truncated" : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <BatchStatusBadge status={batch.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(batch.totalRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {formatNumber(batch.validRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {formatNumber(batch.invalidRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-warning">
                      {formatNumber(batch.duplicateRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(batch.importedRows)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(batch.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination page={page} totalPages={totalPages} total={total} basePath="/imports" baseQuery={{ pageSize: String(PAGE_SIZE) }} />
        </CardContent>
      </Card>
    </div>
  );
}
