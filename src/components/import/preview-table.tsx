"use client";

import * as React from "react";

export type PreviewFilter = "all" | "valid" | "invalid" | "duplicate" | "imported" | "pending";

export interface PreviewRowIssue {
  field: string;
  code: string;
  message: string;
}

export interface PreviewRowDto {
  id: string;
  rowNumber: number;
  status: string;
  duplicateKind: string | null;
  duplicateMessage: string | null;
  normalized: {
    email: { value: string } | null;
    fullName: string | null;
    authorName: string | null;
    bookTitle: string | null;
    seriesName: string | null;
    genre: string | null;
  } | null;
  raw: Record<string, unknown>;
  errors: PreviewRowIssue[];
  warnings: PreviewRowIssue[];
}

export interface PreviewSummaryDto {
  totalRows: number;
  pending: number;
  valid: number;
  invalid: number;
  duplicate: number;
  imported: number;
  skipped: number;
  duplicateBreakdown: Record<string, number>;
}

export interface PreviewPayload {
  status: string;
  summary: PreviewSummaryDto;
  rows: PreviewRowDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function usePreview(batchId: string, pageSize = 25): {
  payload: PreviewPayload | null;
  loading: boolean;
  error: string | null;
  filter: PreviewFilter;
  page: number;
  setFilter: (filter: PreviewFilter) => void;
  setPage: (page: number) => void;
  reload: () => void;
} {
  const [payload, setPayload] = React.useState<PreviewPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilterState] = React.useState<PreviewFilter>("all");
  const [page, setPageState] = React.useState(1);
  const [reloadToken, setReloadToken] = React.useState(0);

  const reload = React.useCallback(() => setReloadToken((token) => token + 1), []);

  function setFilter(next: PreviewFilter) {
    setFilterState(next);
    setPageState(1);
  }

  function setPage(next: number) {
    setPageState(Math.max(1, next));
  }

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/imports/${batchId}/preview?filter=${filter}&page=${page}&pageSize=${pageSize}`)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "The preview could not be loaded.");
          setPayload(null);
          return;
        }
        setPayload((await response.json()) as PreviewPayload);
      })
      .catch(() => {
        if (!cancelled) {
          setError("The server could not be reached.");
          setPayload(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, filter, page, pageSize, reloadToken]);

  return { payload, loading, error, filter, page, setFilter, setPage, reload };
}
