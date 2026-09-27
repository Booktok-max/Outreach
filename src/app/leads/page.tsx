import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, Pagination } from "@/components/page-header";
import { LeadsTable } from "@/components/leads/leads-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { prisma } from "@/lib/db";
import { listGenres, listLeads } from "@/lib/leads/queries";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Leads" };

interface SearchParams {
  search?: string;
  batchId?: string;
  genre?: string;
  emailStatus?: string;
  outreachStatus?: string;
  page?: string;
}

const EMAIL_STATUS_OPTIONS = [

  { value: "all", label: "Any email status" },
  { value: "VALID", label: "Email valid" },
  { value: "INVALID", label: "Email invalid" },
  { value: "UNKNOWN", label: "Email unknown" },
  { value: "MISSING", label: "No email" },
];

const OUTREACH_STATUS_OPTIONS = [
  { value: "all", label: "Any outreach status" },
  { value: "PENDING", label: "Pending review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "SUPPRESSED", label: "Suppressed" },
];

/** GET form so every filter state is a shareable, bookmarkable URL. */
export function FiltersForm({
  batches,
  genres,
  values,
  hasFilters,
}: {
  batches: Array<{ id: string; filename: string }>;
  genres: string[];
  values: {
    search: string;
    batchId: string;
    genre: string;
    emailStatus: string;
    outreachStatus: string;
  };
  hasFilters: boolean;
}) {
  return (
    <form method="get" className="grid gap-3 md:grid-cols-5">
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <Label htmlFor="search">Search</Label>
        <Input
          id="search"
          name="search"
          defaultValue={values.search}
          placeholder="Name, email, organization or book title"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="batchId">Import batch</Label>
        <Select id="batchId" name="batchId" defaultValue={values.batchId}>
          <option value="">All imports</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.filename}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="genre">Genre</Label>
        <Select id="genre" name="genre" defaultValue={values.genre}>
          <option value="">All genres</option>
          {genres.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="emailStatus">Validation</Label>
        <Select id="emailStatus" name="emailStatus" defaultValue={values.emailStatus}>
          {EMAIL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="outreachStatus">Outreach</Label>
        <Select id="outreachStatus" name="outreachStatus" defaultValue={values.outreachStatus}>
          {OUTREACH_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-end gap-2 md:col-span-2">
        <Button type="submit">Apply filters</Button>
        {hasFilters ? (
          <Link
            href="/leads"
            className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/**
 * `/leads` - paginated, server side record browser.
 * Search, filters and pagination all run in PostgreSQL.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const [result, genres, batches] = await Promise.all([
    listLeads({
      search: query.search,
      batchId: query.batchId,
      genre: query.genre,
      emailStatus: query.emailStatus,
      outreachStatus: query.outreachStatus,
      page,
    }),
    listGenres(),
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, filename: true },
    }),
  ]);

  const baseQuery = {
    search: query.search,
    batchId: query.batchId,
    genre: query.genre,
    emailStatus: query.emailStatus,
    outreachStatus: query.outreachStatus,
    pageSize: String(result.pageSize),
  };

  const hasFilters = Boolean(
    query.search || query.batchId || query.genre || query.emailStatus || query.outreachStatus,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Leads"
        description={`${formatNumber(result.total)} contact${result.total === 1 ? "" : "s"} in the database.`}
        actions={
          <Link
            href="/exports"
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Export
          </Link>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <FiltersForm
            batches={batches}
            genres={genres}
            values={{
              search: query.search ?? "",
              batchId: query.batchId ?? "",
              genre: query.genre ?? "",
              emailStatus: query.emailStatus ?? "all",
              outreachStatus: query.outreachStatus ?? "all",
            }}
            hasFilters={hasFilters}
          />
        </CardContent>
      </Card>

      {result.items.length === 0 ? (
        <Card>
          <CardContent className="px-4 py-12 text-center text-sm text-muted-foreground">
            {hasFilters
              ? "No records match these filters."
              : "No contacts yet. Import a file to get started."}
          </CardContent>
        </Card>
      ) : (
        <LeadsTable items={result.items} />
      )}

      <div className="mt-4 rounded-lg border bg-card">
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          basePath="/leads"
          baseQuery={baseQuery}
        />
      </div>
    </div>
  );
}
