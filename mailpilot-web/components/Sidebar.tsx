"use client";

import { cn } from "@/lib/utils";
import { Clock, LayoutDashboard, Mail, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const DASHBOARD_NAV = [
  { href: "/dashboard/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: Mail },
  { href: "/dashboard/activity", label: "Activity", icon: Clock },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Dashboard">
      {DASHBOARD_NAV.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onMobileClose}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-zinc-800 text-zinc-50"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 lg:flex">
        <div className="flex h-14 items-center border-b border-zinc-800 px-4">
          <Link
            href="/dashboard/overview"
            className="text-sm font-semibold tracking-tight text-zinc-50"
          >
            MailPilot
          </Link>
        </div>
        {nav}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation menu"
            onClick={onMobileClose}
          />
          <aside className="relative flex h-full w-56 flex-col border-r border-zinc-800 bg-zinc-900 shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
              <Link
                href="/dashboard/overview"
                className="text-sm font-semibold tracking-tight text-zinc-50"
                onClick={onMobileClose}
              >
                MailPilot
              </Link>
              <button
                type="button"
                onClick={onMobileClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}

export function pageTitleForPath(pathname: string): string {
  const item = DASHBOARD_NAV.find(
    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`)
  );
  return item?.label ?? "Dashboard";
}
