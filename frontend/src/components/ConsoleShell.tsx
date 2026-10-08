"use client";
// Top navigation bar + global behaviour shared by all console pages.
// Shows a hand-drawn logo like the console's; the sign-in and sign-up pages stay unbranded (D-40). The
// console UI below it uses Cloudscape, the open-source design system the AWS console itself is built with.
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { ShortcutsModal, useGlobalShortcuts } from "./KeyboardShortcuts";
import { useNotifications } from "./Notifications";
import { useTheme } from "./Theme";

// Simple hand-drawn console logo: "aws" text with a smile-style arrow.
// Drawn here as SVG (nothing downloaded from amazon.com); sign-in and sign-up pages stay unbranded.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="26" viewBox="0 0 36 26">
<text x="1" y="15" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#ffffff">aws</text>
<path d="M2 19 Q17 25 31 18" stroke="#ff9900" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<path d="M27 16.5 L32 17.6 L29.6 22" stroke="#ff9900" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const LOGO_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO_SVG)}`;

const appsIcon = (
  <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
    {[2, 8, 14].flatMap((x) => [2, 8, 14].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}
  </svg>
);

const helpIcon = (
  <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M6 6.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="8" cy="11.8" r="1" fill="currentColor" />
  </svg>
);

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
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: Infinity });
  // Cloudscape's top bar and AppLayout pick a mobile or desktop layout from the window size, which the
  // server can't know. Rendering only in the browser avoids a hydration mismatch on small screens.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const openHelp = useCallback(() => setHelp(true), []);
  useGlobalShortcuts(openHelp);

  // Alt+S (Option+S on a Mac) focuses the top-bar search, like the console.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && e.code === "KeyS") {
        e.preventDefault();
        // The top bar also renders a hidden copy of the search (inside aria-hidden) to measure its layout.
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".top-search input"));
        inputs.find((input) => !input.closest('[aria-hidden="true"]'))?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function notAvailable(feature: string) {
    notify({ type: "info", content: `${feature} is outside the scope of this clone.` });
  }

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
      setConfirmReset(true);
    }
  }

  async function resetDemo() {
    setResetting(true);
    try {
      await api.resetDemo();
      await queryClient.invalidateQueries();
      router.push("/route53/v2/hostedzones");
      notify({ type: "success", content: "Demo data was restored." });
    } catch (e) {
      notify({ type: "error", header: "Couldn't reset demo data", content: errorMessage(e) });
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }

  if (!mounted) return null;

  return (
    <>
      <div id="top-nav">
        <TopNavigation
          identity={{ href: "/route53/v2/dashboard", logo: { src: LOGO_SRC, alt: "Route 53 console" } }}
          search={
            <div className="top-search-row">
              <Button variant="icon" iconSvg={appsIcon} ariaLabel="Services" onClick={() => notAvailable("The services menu")} />
              <div className="top-search">
                <Input
                  type="search"
                  value={search}
                  placeholder="Search"
                  ariaLabel="Search hosted zones"
                  onChange={(e) => setSearch(e.detail.value)}
                  onKeyDown={(e) => {
                    if (e.detail.key === "Enter") {
                      router.push(`/route53/v2/hostedzones?q=${encodeURIComponent(search.trim())}`);
                    }
                  }}
                />
                <span className="top-search-hint" aria-hidden="true">
                  [Alt+S]
                </span>
              </div>
            </div>
          }
          utilities={[
            { type: "button", iconName: "command-prompt", ariaLabel: "CloudShell", title: "CloudShell", onClick: () => notAvailable("CloudShell") },
            { type: "button", iconName: "notification", ariaLabel: "Notifications", title: "Notifications", onClick: () => notAvailable("Console notifications") },
            { type: "button", iconSvg: helpIcon, ariaLabel: "Help and keyboard shortcuts", title: "Help and keyboard shortcuts (?)", onClick: () => setHelp(true) },
            { type: "button", iconName: "settings", ariaLabel: "Settings", title: "Settings", onClick: () => notAvailable("Console settings") },
            {
              type: "menu-dropdown",
              text: "Global",
              title: "Route 53 is a global service",
              items: [{ id: "global", text: "Route 53 is a global service and doesn't use regions", disabled: true }],
            },
            {
              type: "menu-dropdown",
              // Like the console: "Account name (account ID)" on the menu, the user underneath.
              text: me.data ? (me.data.account_name ? `${me.data.account_name} (${me.data.account_id})` : me.data.username) : "…",
              description: me.data
                ? `${me.data.account_name ? `${me.data.username} · ` : ""}Account ID: ${formatAccount(me.data.account_id)}`
                : undefined,
              iconName: "user-profile",
              onItemClick: (e) => onMenu(e.detail.id),
              items: [
                { id: "theme", text: dark ? "Switch to light mode" : "Switch to dark mode" },
                { id: "shortcuts", text: "Keyboard shortcuts" },
                { id: "reset", text: "Reset demo data" },
                { id: "signout", text: "Sign out" },
                { id: "disclaimer", text: "Not affiliated with AWS", disabled: true },
              ],
            },
          ]}
          i18nStrings={{ overflowMenuTriggerText: "More", overflowMenuTitleText: "All" }}
        />
      </div>
      {children}
      <ShortcutsModal visible={help} onDismiss={() => setHelp(false)} />
      {confirmReset && (
        <Modal
          visible
          onDismiss={() => setConfirmReset(false)}
          header="Reset demo data?"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
                <Button variant="primary" loading={resetting} onClick={resetDemo}>
                  Reset
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          This deletes every hosted zone and record in this account and restores the original demo zones. You can&apos;t
          undo this action.
        </Modal>
      )}
    </>
  );
}
