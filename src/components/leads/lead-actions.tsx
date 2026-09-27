"use client";

import { Ban, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SUPPRESSION_REASON_OPTIONS = [
  { value: "MANUAL", label: "Manual suppression" },
  { value: "UNSUBSCRIBE", label: "Unsubscribe request" },
  { value: "PREVIOUS_CLIENT", label: "Previous client" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "INVALID", label: "Invalid contact" },
  { value: "DO_NOT_CONTACT", label: "Do not contact" },
];

type Action = "approve" | "reject" | "suppress" | "reset";

/**
 * Approve / reject / suppress controls for a single record.
 * Every decision is stored with the operator's note in the audit trail.
 */
export function LeadActions({ personId, status }: { personId: string; status: string }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<Action | null>(null);
  const [reason, setReason] = React.useState("MANUAL");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function apply(action: Action) {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personIds: [personId],
          action,
          reason: action === "suppress" ? reason : null,
          note: note.trim().length > 0 ? note.trim() : null,
          confirmCount: 1,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { changed?: number; error?: string }
        | null;

      if (!response.ok) {
        setError(body?.error ?? "The decision could not be saved.");
        return;
      }

      setMessage("Decision saved.");
      setDialog(null);
      setNote("");
      router.refresh();
    } catch {
      setError("The server could not be reached.");
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

      <div className="flex flex-wrap gap-2">
        <Button
          variant="success"
          size="sm"
          disabled={busy || status === "APPROVED"}
          onClick={() => setDialog("approve")}
        >
          <ThumbsUp className="size-3.5" /> Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || status === "REJECTED"}
          onClick={() => setDialog("reject")}
        >
          <ThumbsDown className="size-3.5" /> Reject
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={busy || status === "SUPPRESSED"}
          onClick={() => setDialog("suppress")}
        >
          <Ban className="size-3.5" /> Suppress
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || status === "PENDING"}
          onClick={() => setDialog("reset")}
        >
          <RotateCcw className="size-3.5" /> Reset to pending
        </Button>
      </div>

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={TITLES[dialog ?? "approve"]}
        description="This is recorded in the review history with your operator account."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={dialog === "suppress" || dialog === "reject" ? "destructive" : "default"}
              onClick={() => dialog && apply(dialog)}
              disabled={busy}
            >
              {busy ? "Saving…" : TITLES[dialog ?? "approve"]}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {dialog === "suppress" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-suppression-reason">Suppression reason (required)</Label>
              <Select
                id="lead-suppression-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              >
                {SUPPRESSION_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-note">Note (optional)</Label>
            <Textarea
              id="lead-note"
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Context for this decision"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

const TITLES: Record<Action, string> = {
  approve: "Approve record",
  reject: "Reject record",
  suppress: "Suppress record",
  reset: "Reset to pending",
};
