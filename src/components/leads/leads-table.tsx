"use client";

import { Ban, CheckSquare, Download, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmailStatusBadge, OutreachStatusBadge } from "@/components/status-badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

export interface LeadRow {
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
}

export type BulkAction = "approve" | "reject" | "suppress" | "reset";

export const SUPPRESSION_REASON_OPTIONS = [
  { value: "MANUAL", label: "Manual suppression" },
  { value: "UNSUBSCRIBE", label: "Unsubscribe request" },
  { value: "PREVIOUS_CLIENT", label: "Previous client" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "INVALID", label: "Invalid contact" },
  { value: "DO_NOT_CONTACT", label: "Do not contact" },
];

export function dialogTitle(action: BulkAction | null): string {
  switch (action) {
    case "approve":
      return "Approve records";
    case "reject":
      return "Reject records";
    case "suppress":
      return "Suppress records";
    case "reset":
      return "Reset to pending";
    default:
      return "";
  }
}

/**
 * Lead browser table with multi-select and bulk review actions.
 *
 * Selection is client side; the server recomputes the exact target set (and
 * rejects the request when the count changed) before anything is written, so a
 * broad state change can never be applied blindly.
 */
export function LeadsTable({ items }: { items: LeadRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [dialog, setDialog] = React.useState<BulkAction | null>(null);
  const [reason, setReason] = React.useState("MANUAL");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const allSelected = items.length > 0 && selected.length === items.length;

  function toggleAll(checked: boolean) {
    setSelected(checked ? items.map((item) => item.id) : []);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));
  }

  async function applyAction() {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personIds: selected,
          action: dialog,
          reason: dialog === "suppress" ? reason : null,
          note: note.trim().length > 0 ? note.trim() : null,
          confirmCount: selected.length,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { changed?: number; error?: string }
        | null;

      if (!response.ok) {
        setError(body?.error ?? "The bulk action could not be completed.");
        return;
      }

      const changed = body?.changed ?? 0;
      setMessage(`${formatNumber(changed)} record${changed === 1 ? "" : "s"} updated.`);
      setDialog(null);
      setNote("");
      setSelected([]);
      router.refresh();
    } catch {
      setError("The server could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  async function exportSelected() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "general",
          scope: "selected",
          personIds: selected,
          format: "csv",
          bookSelection: "all",
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Export failed.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `outreach-selected-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("The export could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert variant="success">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CheckSquare className="size-3.5" />
          {selected.length === 0
            ? "Select records to run bulk actions"
            : `${formatNumber(selected.length)} selected`}
        </span>

        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" disabled={selected.length === 0 || busy} onClick={() => setDialog("approve")}>
            <ThumbsUp className="size-3.5" /> Approve
          </Button>
          <Button size="sm" variant="outline" disabled={selected.length === 0 || busy} onClick={() => setDialog("reject")}>
            <ThumbsDown className="size-3.5" /> Reject
          </Button>
          <Button size="sm" variant="outline" disabled={selected.length === 0 || busy} onClick={() => setDialog("suppress")}>
            <Ban className="size-3.5" /> Suppress
          </Button>
          <Button size="sm" variant="outline" disabled={selected.length === 0 || busy} onClick={exportSelected}>
            <Download className="size-3.5" /> Export
          </Button>
          <Button size="sm" variant="ghost" disabled={selected.length === 0 || busy} onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <LeadsRows
          items={items}
          selected={selected}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
        />
      </div>

      <BulkActionDialog
        open={dialog !== null}
        action={dialog}
        count={selected.length}
        reason={reason}
        note={note}
        busy={busy}
        onReasonChange={setReason}
        onNoteChange={setNote}
        onClose={() => setDialog(null)}
        onConfirm={applyAction}
      />
    </div>
  );
}

function LeadsRows({
  items,
  selected,
  allSelected,
  onToggleAll,
  onToggleOne,
}: {
  items: LeadRow[];
  selected: string[];
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  onToggleOne: (id: string, checked: boolean) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all rows on this page"
              checked={allSelected}
              onChange={(event) => onToggleAll(event.target.checked)}
            />
          </TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Book</TableHead>
          <TableHead>Genre</TableHead>
          <TableHead>Outreach</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <Checkbox
                aria-label={`Select ${item.fullName ?? item.email ?? item.id}`}
                checked={selected.includes(item.id)}
                onChange={(event) => onToggleOne(item.id, event.target.checked)}
              />
            </TableCell>
            <TableCell>
              <Link
                href={`/leads/${item.id}`}
                className="font-medium hover:text-primary hover:underline"
              >
                {item.fullName ?? "Unnamed contact"}
              </Link>
              <div className="text-[11px] text-muted-foreground">
                {item.organization ?? item.role ?? "—"}
              </div>
            </TableCell>
            <TableCell>
              <span className="block max-w-56 truncate text-xs" title={item.email ?? ""}>
                {item.email ?? <span className="text-muted-foreground">—</span>}
              </span>
              <EmailStatusBadge status={item.emailStatus} />
            </TableCell>
            <TableCell>
              <span className="block max-w-52 truncate text-xs" title={item.bookTitle ?? ""}>
                {item.bookTitle ?? <span className="text-muted-foreground">—</span>}
              </span>
              <span className="text-[11px] text-muted-foreground">{item.seriesName ?? ""}</span>
            </TableCell>
            <TableCell className="text-xs">{item.genre ?? "—"}</TableCell>
            <TableCell>
              <OutreachStatusBadge status={item.outreachStatus} />
              {item.suppressionReason ? (
                <div className="text-[11px] text-muted-foreground">
                  {item.suppressionReason.toLowerCase().replace(/_/g, " ")}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-[11px] text-muted-foreground">
              {item.sourceFile ? (
                <>
                  <span className="block max-w-40 truncate" title={item.sourceFile}>
                    {item.sourceFile}
                  </span>
                  row {item.sourceRow}
                </>
              ) : (
                "—"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BulkActionDialog({
  open,
  action,
  count,
  reason,
  note,
  busy,
  onReasonChange,
  onNoteChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  action: BulkAction | null;
  count: number;
  reason: string;
  note: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dialogTitle(action)}
      description={`${formatNumber(count)} record${
        count === 1 ? "" : "s"
      } will change state. This cannot be undone from here.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={action === "suppress" || action === "reject" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Applying…" : dialogTitle(action)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {action === "suppress" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suppression-reason">Suppression reason (required)</Label>
            <Select
              id="suppression-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
            >
              {SUPPRESSION_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Suppressed records never appear in the default GMass export.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-note">Note (optional)</Label>
          <Textarea
            id="bulk-note"
            value={note}
            maxLength={2000}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Why are these records being changed?"
          />
        </div>
      </div>
    </Dialog>
  );
}

