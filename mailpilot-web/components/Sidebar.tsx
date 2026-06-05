"use client";

import { SignOutButton } from "@/app/dashboard/SignOutButton";
import { BrandMark } from "@/components/BrandMark";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Clock, LayoutDashboard, Mail, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export const DASHBOARD_NAV = [
  { href: "/dashboard/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: Mail },
  { href: "/dashboard/activity", label: "Activity", icon: Clock },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

interface SidebarProps {
  userLabel: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SidebarBrand({
  showTagline,
  onNavigate,
}: {
  showTagline: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/dashboard/overview"
      onClick={onNavigate}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg transition-opacity hover:opacity-90",
        focusRing
      )}
    >
      <BrandMark />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-zinc-50">
          MailPilot
        </p>
        {showTagline ? (
          <p className="truncate text-xs text-zinc-500">AI inbox automation</p>
        ) : null}
      </div>
    </Link>
  );
}

function SidebarUserFooter({ userLabel }: { userLabel: string }) {
  return (
    <div className="mt-auto border-t border-zinc-800 p-3">
      <p
        className="truncate text-xs text-zinc-500"
        title={userLabel}
      >
        {userLabel}
      </p>
      <SignOutButton variant="sidebar" />
    </div>
  );
}

export function Sidebar({
  userLabel,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    onMobileClose();
  }, [pathname, onMobileClose]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstLink = drawerRef.current?.querySelector<HTMLElement>("a[href]");
    firstLink?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, onMobileClose]);

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
              "flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-colors",
              focusRing,
              active
                ? "border-indigo-400 bg-zinc-800/80 text-zinc-50"
                : "border-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "text-indigo-400" : undefined
              )}
              strokeWidth={active ? 2.25 : 2}
              aria-hidden
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 lg:flex">
        <div className="flex h-16 items-center border-b border-zinc-800 px-4">
          <SidebarBrand showTagline />
        </div>
        {nav}
        <SidebarUserFooter userLabel={userLabel} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation menu"
            onClick={onMobileClose}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="animate-drawer-in relative flex h-full w-[min(14rem,85vw)] max-w-xs flex-col border-r border-zinc-800 bg-zinc-900 shadow-xl"
          >
            <div className="flex h-14 items-center justify-between gap-2 border-b border-zinc-800 px-4">
              <SidebarBrand showTagline={false} onNavigate={onMobileClose} />
              <button
                type="button"
                onClick={onMobileClose}
                className={cn(
                  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
                  focusRing
                )}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {nav}
            <SidebarUserFooter userLabel={userLabel} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

export function pageTitleForPath(pathname: string): string {
  const item = DASHBOARD_NAV.find(
    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`)
  );
  return item?.label ?? "Dashboard";
}
