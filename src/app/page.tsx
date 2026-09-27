import { ArrowRight, FileSpreadsheet } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { BatchStatusBadge } from "@/components/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDashboardStats } from "@/lib/dashboard";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  href?: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";

  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {formatNumber(value)}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="group block">
        <Card className="transition-colors group-hover:border-primary/50">
          <CardContent className="p-4">{body}</CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">{body}</CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard"
        description="Operational overview of contacts, books and review status."
        actions={
          <>
            <Link
              href="/imports/new"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Import a file
            </Link>
            <Link
              href="/exports"
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Export for GMass
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total contacts" value={stats.totalContacts} href="/leads" />
        <Stat label="Total books" value={stats.totalBooks} />
        <Stat
          label="Pending review"
          value={stats.pendingReview}
          href="/leads?outreachStatus=PENDING"
          tone="warning"
        />
        <Stat
          label="Approved"
          value={stats.approved}
          href="/leads?outreachStatus=APPROVED"
          tone="success"
        />
        <Stat
          label="Rejected"
          value={stats.rejected}
          href="/leads?outreachStatus=REJECTED"
          tone="destructive"
        />
        <Stat
          label="Suppressed"
          value={stats.suppressed}
          href="/leads?outreachStatus=SUPPRESSED"
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Valid emails" value={stats.validEmails} href="/leads?emailStatus=VALID" />
        <Stat
          label="Invalid emails"
          value={stats.invalidEmails}
          href="/leads?emailStatus=INVALID"
          tone="destructive"
        />
        <Stat label="Missing email" value={stats.missingEmails} href="/leads?emailStatus=MISSING" />
        <Stat
          label="Rows awaiting import"
          value={stats.stagedRows}
          href="/imports"
          tone="warning"
        />
      </section>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent imports</CardTitle>
          <Link
            href="/imports"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View all <ArrowRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recentImports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <FileSpreadsheet className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">No imports yet</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Upload a CSV or XLSX file to stage contacts. Nothing is written to the database
                until you review the mapping and confirm the import.
              </p>
              <Link
                href="/imports/new"
                className="mt-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start your first import
              </Link>
            </div>
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
                {stats.recentImports.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <Link
                        href={`/imports/${batch.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {batch.filename}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">{batch.fileType}</div>
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
        </CardContent>
      </Card>
    </div>
  );
}

