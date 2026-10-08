import "@cloudscape-design/global-styles/index.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Route 53 Console Clone",
  description: "A Route 53 style DNS management console built with Next.js, FastAPI and SQLite.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
