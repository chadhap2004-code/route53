import "@cloudscape-design/global-styles/index.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "@/components/Providers";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Route 53 Console Clone",
  description: "A Route 53 style DNS management console built with Next.js, FastAPI and SQLite.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* THEME_SCRIPT may add the dark-mode class to <body> before React hydrates, hence the warning opt-out. */}
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
