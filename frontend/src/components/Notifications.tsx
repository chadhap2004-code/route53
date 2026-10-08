"use client";
// App-wide Flashbar notifications (the green/red banners at the top of the AWS console).
// Lives above the page components so a message survives navigation, e.g.
// "Hosted zone created" is still visible after redirecting to the new zone's page.
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Notice = { type: "success" | "error" | "info" | "warning"; header?: ReactNode; content?: ReactNode; loading?: boolean };

interface Ctx {
  items: FlashbarProps.MessageDefinition[];
  notify: (n: Notice) => string;
  dismiss: (id: string) => void;
}

const NotificationsContext = createContext<Ctx | null>(null);
let counter = 0;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);

  const dismiss = useCallback((id: string) => setItems((prev) => prev.filter((i) => i.id !== id)), []);

  const notify = useCallback(
    (n: Notice) => {
      const id = `n${++counter}`;
      setItems((prev) => [
        { ...n, id, dismissible: true, dismissLabel: "Dismiss message", onDismiss: () => dismiss(id) },
        ...prev.slice(0, 4),
      ]);
      // Success/info messages fade on their own; errors stay until dismissed, like the console.
      if (n.type === "success" || n.type === "info") setTimeout(() => dismiss(id), 8000);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ items, notify, dismiss }), [items, notify, dismiss]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
