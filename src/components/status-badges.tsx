import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const OUTREACH_STYLES: Record<string, string> = {
  PENDING: "bg-warning text-warning-foreground",
  APPROVED: "bg-success text-success-foreground",
  REJECTED: "bg-destructive text-destructive-foreground",
  SUPPRESSED: "bg-muted-foreground text-background",
};

const OUTREACH_LABELS: Record<string, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPPRESSED: "Suppressed",
};

export function OutreachStatusBadge({ status }: { status: string | null | undefined }) {
  const key = status ?? "PENDING";
  return (
    <Badge className={cn("border-transparent", OUTREACH_STYLES[key] ?? "bg-muted text-foreground")}>
      {OUTREACH_LABELS[key] ?? key}
    </Badge>
  );
}

const ROW_STYLES: Record<string, string> = {
  VALID: "bg-success text-success-foreground",
  INVALID: "bg-destructive text-destructive-foreground",
  DUPLICATE: "bg-warning text-warning-foreground",
  IMPORTED: "bg-primary text-primary-foreground",
  PENDING: "bg-muted text-muted-foreground",
  SKIPPED: "bg-muted-foreground text-background",
};

const ROW_LABELS: Record<string, string> = {
  VALID: "Valid",
  INVALID: "Invalid",
  DUPLICATE: "Duplicate",
  IMPORTED: "Imported",
  PENDING: "Pending",
  SKIPPED: "Skipped",
};

export function RowStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("border-transparent", ROW_STYLES[status] ?? "bg-muted text-foreground")}>
      {ROW_LABELS[status] ?? status}
    </Badge>
  );
}

const EMAIL_STYLES: Record<string, string> = {
  VALID: "bg-success text-success-foreground",
  INVALID: "bg-destructive text-destructive-foreground",
  UNKNOWN: "bg-muted text-muted-foreground",
};

export function EmailStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge className="border-transparent bg-muted text-muted-foreground">No email</Badge>;
  return (
    <Badge className={cn("border-transparent", EMAIL_STYLES[status] ?? "bg-muted text-muted-foreground")}>
      {status === "VALID" ? "Email valid" : status === "INVALID" ? "Email invalid" : "Email unknown"}
    </Badge>
  );
}

const BATCH_STYLES: Record<string, string> = {
  UPLOADED: "bg-muted text-muted-foreground",
  MAPPED: "bg-warning text-warning-foreground",
  VALIDATED: "bg-primary text-primary-foreground",
  IMPORTED: "bg-success text-success-foreground",
  FAILED: "bg-destructive text-destructive-foreground",
  CANCELLED: "bg-muted-foreground text-background",
};

export function BatchStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("border-transparent", BATCH_STYLES[status] ?? "bg-muted text-muted-foreground")}>
      {status.toLowerCase()}
    </Badge>
  );
}
