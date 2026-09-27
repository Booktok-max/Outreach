import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-md border px-3 py-2 text-sm", {
  variants: {
    variant: {
      default: "border-border bg-card text-foreground",
      info: "border-primary/30 bg-primary/5 text-foreground",
      success: "border-success/40 bg-success/10 text-foreground",
      warning: "border-warning/50 bg-warning/10 text-foreground",
      destructive: "border-destructive/40 bg-destructive/10 text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <p className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
