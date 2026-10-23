import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import { getAthlete } from "@/lib/db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Training Hub",
  description: "HYROX prediction, fitness progress and training-load advice from Strava",
  appleWebApp: { capable: true, title: "Training Hub", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1014" },
  ],
};

async function showPredictions(): Promise<boolean> {
  try {
    return (await getAthlete()).show_predictions ?? false;
  } catch {
    return false; // not set up yet (or signed out): the plain navigation
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Nav showPredictions={await showPredictions()} />
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 md:pb-10 md:pt-20">{children}</main>
      </body>
    </html>
  );
}
