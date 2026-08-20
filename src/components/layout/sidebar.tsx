"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderTree,
  Inbox,
  Settings,
  Table2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppData } from "@/lib/data/store";
import { ThemeToggle } from "@/components/layout/theme";

const navigation = [
  { href: "/rejestr", label: "Rejestr dokumentów", icon: Table2 },
  { href: "/bufor", label: "Bufor", icon: Inbox, badge: "buffer" as const },
  { href: "/kategorie", label: "Kategorie", icon: FolderTree },
  { href: "/kontrahenci", label: "Kontrahenci", icon: Users },
  { href: "/ustawienia", label: "Ustawienia", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { state } = useAppData();
  const bufferCount = state.documents.filter((document) => document.stage === "buffer").length;

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <BerryMark className="size-4.5" />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-fg">Gumijagoda</div>
          <div className="truncate text-[11.5px] text-fg-subtle">Moduł faktur</div>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 px-2.5 py-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const showBadge = item.badge === "buffer" && bufferCount > 0;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {showBadge ? (
                  <span className="tnum rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg">
                    {bufferCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border px-3 py-3">
        <div className="mb-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
          <div className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Środowisko</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-fg-muted">
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            KSeF — środowisko testowe
          </div>
        </div>
        <ThemeToggle className="w-full justify-between" />
      </div>
    </nav>
  );
}

/** Znak graficzny — jagoda z listkiem. */
function BerryMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 6.5c2.9 0 5.5 2.3 5.5 5.4 0 3.4-2.5 6.1-5.5 6.1S6.5 15.3 6.5 11.9C6.5 8.8 9.1 6.5 12 6.5Z" fill="currentColor" />
      <path d="M12 6.5V3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12.2 4.6c1.6-1.4 3.4-1.6 4.6-1.4.2 1.3-.2 3-1.8 4.1-1.3.9-2.7.8-3.4.6-.1-.8.2-2.3 1.1-3.3Z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
