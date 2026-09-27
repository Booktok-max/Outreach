import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { LeadActions } from "@/components/leads/lead-actions";
import { LeadEditForm } from "@/components/leads/lead-edit-form";
import { EmailStatusBadge, OutreachStatusBadge } from "@/components/status-badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLeadDetail } from "@/lib/leads/detail";
import { formatDateTime, safeLink, truncate } from "@/lib/leads/view-helpers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Record" };

/** `/leads/[id]` - contact, book, relationship, import and outreach detail. */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLeadDetail(id);

  if (!lead) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader
        title={lead.fullName ?? lead.penName ?? "Unnamed contact"}
        description={lead.primaryEmail ?? "No email address on file"}
        actions={
          <>
            <OutreachStatusBadge status={lead.outreach?.status ?? "PENDING"} />
            <EmailStatusBadge status={lead.emailStatus} />
            <Link
              href="/leads"
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Back to leads
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>Person level information and contact points.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs md:grid-cols-2">
            <MetaRow label="Full name" value={lead.fullName} />
            <MetaRow label="Author / pen name" value={lead.penName} />
            <MetaRow label="First name" value={lead.firstName} />
            <MetaRow label="Last name" value={lead.lastName} />
            <MetaRow label="Organization" value={lead.organization} />
            <MetaRow label="Role" value={lead.role} />
            <MetaRow label="Email" value={lead.primaryEmail} />
            <MetaRow label="Website" value={lead.websiteUrl} link />
            <MetaRow label="X / Twitter" value={lead.twitterUrl} link />
            <MetaRow label="Instagram" value={lead.instagramUrl} link />
            <MetaRow label="Facebook" value={lead.facebookUrl} link />
            <MetaRow label="LinkedIn" value={lead.linkedinUrl} link />
            <MetaRow label="TikTok" value={lead.tiktokUrl} link />
            <MetaRow label="Goodreads" value={lead.goodreadsUrl} link />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import</CardTitle>
            <CardDescription>Where this record came from.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs">
            <MetaRow label="Source file" value={lead.provenance?.sourceFile ?? null} />
            <MetaRow
              label="Source row"
              value={lead.provenance?.sourceRow ? String(lead.provenance.sourceRow) : null}
            />
            <MetaRow label="Import date" value={lead.provenance?.importDate ?? null} formatted />
            <MetaRow label="Row status" value={lead.provenance?.rowStatus ?? null} />
            {lead.provenance?.batchId ? (
              <Link
                href={`/imports/${lead.provenance.batchId}`}
                className="text-primary hover:underline"
              >
                Open import batch
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Book{lead.books.length === 1 ? "" : "s"}</CardTitle>
            <CardDescription>
              {lead.books.length === 0
                ? "No book is linked to this contact yet."
                : `${lead.books.length} relationship${lead.books.length === 1 ? "" : "s"} on file.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {lead.books.map((book) => (
              <div key={book.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{book.title}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-sm bg-muted px-1.5 py-0.5">
                      Relationship: {book.role.toLowerCase().replace(/_/g, " ")}
                    </span>
                    {book.isPrimaryBook ? (
                      <span className="rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground">
                        Primary book
                      </span>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-2 grid gap-1.5 text-xs md:grid-cols-2">
                  <MetaRow label="Series" value={book.seriesName} />
                  <MetaRow
                    label="Series number"
                    value={book.seriesPosition ? String(book.seriesPosition) : null}
                  />
                  <MetaRow label="Genre" value={book.genre} />
                  <MetaRow label="Format" value={book.bookFormat} />
                  <MetaRow label="Language" value={book.language} />
                  <MetaRow label="Publisher" value={book.publisher} />
                  <MetaRow label="ISBN" value={book.isbn} />
                  <MetaRow label="Publication date" value={book.publicationDate} />
                  <MetaRow label="Book URL" value={book.bookUrl} link />
                  <MetaRow label="Amazon URL" value={book.amazonUrl} link />
                </dl>
                {book.description ? (
                  <div className="mt-2">
                    <p className="text-[11px] text-muted-foreground">Description</p>
                    <p className="whitespace-pre-line text-xs">{truncate(book.description, 600)}</p>
                  </div>
                ) : null}
              </div>
            ))}
            {lead.books.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This contact was imported without book information.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>Approve, reject or suppress this contact.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <LeadActions personId={lead.id} status={lead.outreach?.status ?? "PENDING"} />

            <dl className="flex flex-col gap-2 border-t pt-3 text-xs">
              <MetaRow label="Status" value={lead.outreach?.status ?? "PENDING"} />
              <MetaRow label="Suppression reason" value={lead.outreach?.suppressionReason ?? null} />
              <MetaRow label="Reviewed by" value={lead.outreach?.reviewedBy ?? null} />
              <MetaRow label="Reviewed at" value={lead.outreach?.reviewedAt ?? null} formatted />
              <MetaRow label="Decision note" value={lead.outreach?.decisionNote ?? null} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Review history</CardTitle>
          <CardDescription>Append-only trail of approval decisions.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs">
          {lead.events.length === 0 ? (
            <p className="text-muted-foreground">No decisions recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lead.events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0"
                >
                  <span className="font-medium">{event.type.toLowerCase()}</span>
                  <span className="text-muted-foreground">
                    {event.fromState ?? "—"} → {event.toState}
                  </span>
                  {event.reason ? (
                    <span className="text-muted-foreground">
                      ({event.reason.toLowerCase().replace(/_/g, " ")})
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                  {event.actor ? (
                    <span className="text-muted-foreground">by {event.actor}</span>
                  ) : null}
                  {event.note ? <span className="w-full">{event.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit record</CardTitle>
          <CardDescription>
            Corrections are validated server side; the search index and export data update with
            them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadEditForm
            personId={lead.id}
            initial={{
              email: lead.primaryEmail ?? "",
              firstName: lead.firstName ?? "",
              lastName: lead.lastName ?? "",
              fullName: lead.fullName ?? "",
              penName: lead.penName ?? "",
              organization: lead.organization ?? "",
              role: lead.role ?? "",
              notes: lead.notes ?? "",
              websiteUrl: lead.websiteUrl ?? "",
              twitterUrl: lead.twitterUrl ?? "",
              instagramUrl: lead.instagramUrl ?? "",
              facebookUrl: lead.facebookUrl ?? "",
              linkedinUrl: lead.linkedinUrl ?? "",
              tiktokUrl: lead.tiktokUrl ?? "",
              goodreadsUrl: lead.goodreadsUrl ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MetaRow({
  label,
  value,
  link = false,
  formatted = false,
}: {
  label: string;
  value: string | null;
  link?: boolean;
  formatted?: boolean;
}) {
  const href = link ? safeLink(value) : null;

  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[70%] break-words text-right font-medium">
        {value ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="text-primary hover:underline"
            >
              {truncate(value, 60)}
            </a>
          ) : formatted ? (
            formatDateTime(value)
          ) : (
            truncate(value, 120)
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}

