import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { listUnsubscribedContacts } from "@/lib/unsubscribed";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UnsubscribedPage({ searchParams }: PageProps) {
  await requireSession();

  const params = (await searchParams) ?? {};
  const search = first(params.search) ?? "";
  const sort = (first(params.sort) as "date_desc" | "date_asc" | "email_asc" | "email_desc" | undefined) ?? "date_desc";
  const page = Number(first(params.page) ?? "1");

  let data;
  let error: string | null = null;
  try {
    data = await listUnsubscribedContacts({ search, sort, page, pageSize: 50 });
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load unsubscribed contacts.";
    data = { items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 };
  }

  const buildHref = (overrides: Record<string, string>) => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (sort && sort !== "date_desc") qs.set("sort", sort);
    for (const [key, value] of Object.entries(overrides)) {
      if (value) qs.set(key, value);
      else qs.delete(key);
    }
    const query = qs.toString();
    return query ? `/unsubscribed?${query}` : "/unsubscribed";
  };

  const exportParams = new URLSearchParams();
  if (search) exportParams.set("search", search);
  if (sort && sort !== "date_desc") exportParams.set("sort", sort);
  const exportQuery = exportParams.toString();
  const exportHref = `/api/unsubscribed/export${exportQuery ? `?${exportQuery}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Unsubscribed contacts"
        description="Contacts who have unsubscribed or been suppressed. These contacts must not be contacted."
        actions={
          <>
            <Link
              href={exportHref}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Export CSV
            </Link>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <form method="get" action="/unsubscribed" className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="search">
                Search by email or name
              </label>
              <input
                id="search"
                name="search"
                type="search"
                defaultValue={search}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="sort">
                Sort
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={sort}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="email_asc">Email A-Z</option>
                <option value="email_desc">Email Z-A</option>
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply
            </button>
            {search ? (
              <Link href="/unsubscribed" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                Clear
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Failed to load unsubscribed contacts: {error}
          </CardContent>
        </Card>
      ) : data.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <p className="text-sm font-medium">No unsubscribed contacts</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Contacts who unsubscribe or are suppressed will appear here. Suppressed contacts must
              not be contacted.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              {data.total} suppressed contact{data.total === 1 ? "" : "s"}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Page {data.page} of {data.totalPages}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Suppressed at</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Context</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.personId}>
                    <TableCell className="font-mono text-xs">{item.email ?? "—"}</TableCell>
                    <TableCell>{item.fullName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.suppressedAt ? formatDateTime(item.suppressedAt) : "—"}
                    </TableCell>
                    <TableCell>{item.source === "unsubscribe-link" ? "Unsubscribe link" : "Manual action"}</TableCell>
                    <TableCell>{item.suppressionReason ?? "—"}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {item.note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link
            href={buildHref({ page: String(Math.max(1, data.page - 1)) })}
            className={`rounded-md border px-3 py-1.5 text-xs ${data.page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-muted"}`}
          >
            Previous
          </Link>
          <Link
            href={buildHref({ page: String(Math.min(data.totalPages, data.page + 1)) })}
            className={`rounded-md border px-3 py-1.5 text-xs ${data.page >= data.totalPages ? "pointer-events-none opacity-50" : "hover:bg-muted"}`}
          >
            Next
          </Link>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        Suppressed contacts must not be contacted. Manual replies such as &quot;unsubscribe&quot;,
        &quot;opt out&quot;, &quot;remove&quot;, &quot;stop&quot; and &quot;no thanks&quot; continue to be handled through the
        existing suppression workflow.
      </p>
    </div>
  );
}