"use client";

import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Modal dialog built on a plain overlay (no external dependency).
 * Esc / backdrop click close it, focus is moved into the dialog on open.
 */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-lg border bg-card p-4 shadow-lg outline-none",
          className,
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">{children}</div>

        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
