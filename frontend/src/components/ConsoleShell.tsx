"use client";
// Top navigation bar + global behaviour shared by all console pages.
// Deliberately unbranded (no AWS logo / wording) because it's publicly hosted; the console UI below
// it uses Cloudscape, the open-source design system the AWS console itself is built with.
import Input from "@cloudscape-design/components/input";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { ShortcutsModal, useGlobalShortcuts } from "./KeyboardShortcuts";
import { useNotifications } from "./Notifications";
import { useTheme } from "./Theme";

function formatAccount(id: string) {
  return id.replace(/(\d{4})(\d{4})(\d{4})/, "$1-$2-$3");
}

export default function ConsoleShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  const { dark, toggle } = useTheme();
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState("");
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: Infinity });

  const openHelp = useCallback(() => setHelp(true), []);
  useGlobalShortcuts(openHelp);

  async function onMenu(id: string) {
    if (id === "signout") {
      await api.logout().catch(() => undefined);
      queryClient.clear();
      router.replace("/login");
    } else if (id === "theme") {
      toggle();
    } else if (id === "shortcuts") {
      setHelp(true);
    } else if (id === "reset") {
      try {
        await api.resetDemo();
        await queryClient.invalidateQueries();
        router.push("/route53/v2/hostedzones");
        notify({ type: "success", content: "Demo data was restored." });
      } catch (e) {
        notify({ type: "error", header: "Couldn't reset demo data", content: errorMessage(e) });
      }
    }
  }

  return (
    <>
      <div id="top-nav">
        <TopNavigation
          identity={{ href: "/route53/v2/hostedzones", title: "Route 53 Console" }}
          search={
            <Input
              type="search"
              value={search}
              placeholder="Search hosted zones"
              ariaLabel="Search hosted zones"
              onChange={(e) => setSearch(e.detail.value)}
              onKeyDown={(e) => {
                if (e.detail.key === "Enter") {
                  router.push(`/route53/v2/hostedzones?q=${encodeURIComponent(search.trim())}`);
                }
              }}
            />
          }
          utilities={[
            { type: "button", iconName: "keyboard", ariaLabel: "Keyboard shortcuts", title: "Keyboard shortcuts (?)", onClick: () => setHelp(true) },
            { type: "button", text: "Global", title: "Route 53 is a global service" },
            {
              type: "menu-dropdown",
              text: me.data ? me.data.username : "…",
              description: me.data ? `Account ID: ${formatAccount(me.data.account_id)}` : undefined,
              iconName: "user-profile",
              onItemClick: (e) => onMenu(e.detail.id),
              items: [
                { id: "theme", text: dark ? "Switch to light mode" : "Switch to dark mode" },
                { id: "shortcuts", text: "Keyboard shortcuts" },
                { id: "reset", text: "Reset demo data" },
                { id: "signout", text: "Sign out" },
              ],
            },
          ]}
          i18nStrings={{ overflowMenuTriggerText: "More", overflowMenuTitleText: "All" }}
        />
      </div>
      {children}
      <ShortcutsModal visible={help} onDismiss={() => setHelp(false)} />
    </>
  );
}
