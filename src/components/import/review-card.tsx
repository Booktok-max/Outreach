import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

export interface ValidationSummary {
  totalRows: number;
  valid: number;
  invalid: number;
  duplicate: number;
  imported: number;
  skipped: number;
}

/** Validation summary strip (row counts after VALIDATE). */
export function ReviewCard({ summary }: { summary: ValidationSummary }) {
  const items: Array<{ label: string; value: number; className: string }> = [
    { label: "Rows", value: summary.totalRows, className: "" },
    { label: "Valid", value: summary.valid, className: "text-success" },
    { label: "Invalid", value: summary.invalid, className: "text-destructive" },
    { label: "Duplicate", value: summary.duplicate, className: "text-warning" },
    { label: "Imported", value: summary.imported, className: "text-primary" },
  ];

  if (summary.skipped > 0) {
    items.push({ label: "Skipped", value: summary.skipped, className: "text-muted-foreground" });
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-wrap gap-4 rounded-md text-xs">
          {items.map((item) => (
            <span key={item.label} className="tabular-nums">
              <span className="text-muted-foreground">{item.label}: </span>
              <strong className={item.className}>{formatNumber(item.value)}</strong>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Shown while validation has never run for this batch. */
export function ReviewEmptyState() {
  return (
    <Alert>
      <AlertDescription>
        Nothing validated yet. Confirm the column mapping above, then press “Validate rows”.
      </AlertDescription>
    </Alert>
  );
}
