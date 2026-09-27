"use client";

import {
  Database,
  Download,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/imports", label: "Imports", icon: Database },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/exports", label: "Export", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Application chrome: sidebar navigation + operator header. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  // The login screen renders on its own, without navigation.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 hidden w-56 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-sm font-semibold tracking-tight">
            Atomic Shelf <span className="text-primary">Outreach</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <p className="mb-2 px-1 text-[11px] text-muted-foreground">
            Internal tool · V1
            <br />
            IMPORT → REVIEW → EXPORT
          </p>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:pl-56">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card/90 px-4 backdrop-blur">
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/" className="text-sm font-semibold">
              Atomic Shelf Outreach
            </Link>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            Book &amp; author outreach data preparation
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/imports/new"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              New import
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
