import { prisma } from "@/lib/db";

export interface RecentImport {
  id: string;
  filename: string;
  fileType: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  createdAt: string;
}

export interface DashboardStats {
  totalContacts: number;
  totalBooks: number;
  totalRelationships: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  suppressed: number;
  validEmails: number;
  invalidEmails: number;
  missingEmails: number;
  stagedRows: number;
  recentImports: RecentImport[];
}

/**
 * Dashboard aggregates. All counters are database side `COUNT` queries - the
 * dashboard never downloads rows to count them.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    totalContacts,
    totalBooks,
    totalRelationships,
    approved,
    rejected,
    suppressed,
    validEmails,
    invalidEmails,
    missingEmails,
    stagedRows,
    recentImports,
  ] = await Promise.all([
    prisma.person.count(),
    prisma.book.count(),
    prisma.personBook.count(),
    prisma.person.count({ where: { outreach: { is: { status: "APPROVED" } } } }),
    prisma.person.count({ where: { outreach: { is: { status: "REJECTED" } } } }),
    prisma.person.count({ where: { outreach: { is: { status: "SUPPRESSED" } } } }),
    prisma.person.count({ where: { emailStatus: "VALID" } }),
    prisma.person.count({ where: { emailStatus: "INVALID" } }),
    prisma.person.count({ where: { primaryEmail: null } }),
    prisma.importRow.count({ where: { status: { in: ["PENDING", "VALID", "INVALID", "DUPLICATE"] } } }),
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        filename: true,
        fileType: true,
        status: true,
        totalRows: true,
        validRows: true,
        invalidRows: true,
        duplicateRows: true,
        importedRows: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    totalContacts,
    totalBooks,
    totalRelationships,
    pendingReview: Math.max(
      0,
      totalContacts - approved - rejected - suppressed,
    ),
    approved,
    rejected,
    suppressed,
    validEmails,
    invalidEmails,
    missingEmails,
    stagedRows,
    recentImports: recentImports.map((batch) => ({
      id: batch.id,
      filename: batch.filename,
      fileType: batch.fileType,
      status: batch.status,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      duplicateRows: batch.duplicateRows,
      importedRows: batch.importedRows,
      createdAt: batch.createdAt.toISOString(),
    })),
  };
}
