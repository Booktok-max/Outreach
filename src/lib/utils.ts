import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui class merging helper. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a date for the admin UI (server rendered, stable across locales). */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0";
  return new Intl.NumberFormat("en-US").format(value);
}

export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Turns arbitrary strings into safe-ish slugs for CSS classes / anchors. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
