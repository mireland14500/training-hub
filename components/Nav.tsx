"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Today", icon: "M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" },
  { href: "/calendar", label: "Calendar", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { href: "/hyrox", label: "HYROX", icon: "M5 21V4M5 4h11l-2 4 2 4H5" },
  { href: "/progress", label: "Progress", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/running", label: "Running", icon: "M3 12h4l3-8 4 16 3-8h4" },
];

export default function Nav() {
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
          {ITEMS.map((i) => (
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
        <div className="grid grid-cols-5">
          {ITEMS.map((i) => (
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
