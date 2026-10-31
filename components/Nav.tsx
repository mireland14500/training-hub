"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Today", icon: "M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" },
  { href: "/plan", label: "Plan", icon: "M9 5h11M9 12h11M9 19h11M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2" },
  { href: "/calendar", label: "Calendar", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { href: "/running", label: "Running", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/body", label: "Body", icon: "M12 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM6 10h12M12 10v5l-3 6M12 15l3 6" },
];
const PREDICTION_ITEMS = [
  { href: "/hyrox", label: "HYROX", icon: "M5 21V4M5 4h11l-2 4 2 4H5" },
];

export default function Nav({ showPredictions = false }: { showPredictions?: boolean }) {
  const items = showPredictions ? [...ITEMS, ...PREDICTION_ITEMS] : ITEMS;
  const path = usePathname();
  if (path === "/login") return null;
  const active = (href: string) =>
    href === "/"
      ? path === "/" || path === "/settings"
      : href === "/calendar"
        ? ["/calendar", "/session", "/log", "/checkin", "/ergs"].some((p) => path.startsWith(p))
        : path.startsWith(href);
  return (
    <>
      {/* Desktop top bar */}
      <header className="fixed inset-x-0 top-0 z-20 hidden border-b border-border bg-card/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <span className="font-bold">Training Hub</span>
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`text-sm ${active(i.href) ? "font-semibold text-accent" : "text-muted hover:text-text"}`}>
              {i.label}
            </Link>
          ))}
          <Link href="/settings" className={`ml-auto text-sm ${path === "/settings" ? "font-semibold text-accent" : "text-muted hover:text-text"}`}>
            Settings
          </Link>
        </div>
      </header>
      {/* Phone bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active(i.href) ? "text-accent" : "text-muted"}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={i.icon} />
              </svg>
              {i.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
