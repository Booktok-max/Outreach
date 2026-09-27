import Link from "next/link";
import * as React from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  /** Query parameters preserved across pages (without `page`). */
  baseQuery?: Record<string, string | undefined>;
  basePath: string;
}

/** Server rendered pagination - no client state, works with browser history. */
export function Pagination({ page, totalPages, total, baseQuery = {}, basePath }: PaginationProps) {
  const pageSize = baseQuery.pageSize ? Number(baseQuery.pageSize) : 25;

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(baseQuery)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const previousDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3">
      <p className="text-xs text-muted-foreground tabular-nums">
        {total === 0
          ? "No records"
          : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </p>

      <div className="flex items-center gap-2">
        <Link
          href={buildHref(Math.max(1, page - 1))}
          aria-disabled={previousDisabled}
          tabIndex={previousDisabled ? -1 : undefined}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            previousDisabled && "pointer-events-none opacity-50",
          )}
        >
          Previous
        </Link>

        <span className="text-xs text-muted-foreground tabular-nums">
          Page {page.toLocaleString()} of {Math.max(1, totalPages).toLocaleString()}
        </span>

        <Link
          href={buildHref(Math.min(totalPages, page + 1))}
          aria-disabled={nextDisabled}
          tabIndex={nextDisabled ? -1 : undefined}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            nextDisabled && "pointer-events-none opacity-50",
          )}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
