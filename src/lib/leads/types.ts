export type EmailStatusFilter = "all" | "VALID" | "INVALID" | "UNKNOWN" | "MISSING";

export type OutreachStatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED" | "SUPPRESSED";

export interface LeadsQuery {
  search?: string | undefined;
  batchId?: string | undefined;
  genre?: string | undefined;
  emailStatus?: EmailStatusFilter | undefined;
  outreachStatus?: OutreachStatusFilter | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface LeadListFilters {
  search: string;
  batchId: string | null;
  genre: string | null;
  emailStatus: EmailStatusFilter;
  outreachStatus: OutreachStatusFilter;
}

export interface LeadListItem {
  id: string;
  fullName: string | null;
  email: string | null;
  emailStatus: string | null;
  organization: string | null;
  role: string | null;
  outreachStatus: string;
  suppressionReason: string | null;
  bookTitle: string | null;
  seriesName: string | null;
  genre: string | null;
  sourceFile: string | null;
  sourceRow: number | null;
  importedAt: string | null;
}

export interface LeadListPage {
  items: LeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: LeadListFilters;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

