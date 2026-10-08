"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { NotificationsProvider } from "./Notifications";
import { ThemeProvider } from "./Theme";

export default function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser tab. Created in state so it isn't recreated on re-render.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            // Don't retry 4xx errors (e.g. 404 zone) - retrying won't change the answer.
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <NotificationsProvider>{children}</NotificationsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
