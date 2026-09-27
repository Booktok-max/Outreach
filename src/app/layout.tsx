import type { Metadata } from "next";
import * as React from "react";

import { AppShell } from "@/components/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Atomic Shelf Outreach",
    template: "%s · Atomic Shelf Outreach",
  },
  description:
    "Internal tool for importing, validating and exporting book and author outreach records.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
