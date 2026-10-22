"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Recovery", icon: "M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" },
  { href: "/running", label: "Running", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/ski", label: "SkiErg", icon: "M6 3v18M18 3v18M6 8h12M4 21h4M16 21h4" },
  { href: "/activities", label: "Log", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/settings", label: "Settings", icon: "M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4" },
];

export default function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  const active = (href: string) => (href === "/" ? path === "/" || path === "/checkin" : path.startsWith(href));
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
