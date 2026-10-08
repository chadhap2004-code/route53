"use client";
// Global keyboard shortcuts. Ignored while typing in an input so they never steal keystrokes.
//   /      focus the page's search box        c   create (zone or record, depending on page)
//   g h    go to hosted zones                 g d go to dashboard
//   t      toggle dark mode                   ?   show this help
import Box from "@cloudscape-design/components/box";
import Modal from "@cloudscape-design/components/modal";
import Table from "@cloudscape-design/components/table";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTheme } from "./Theme";

const SHORTCUTS = [
  { keys: ["Alt+S"], action: "Focus the top-bar search" },
  { keys: ["/"], action: "Focus the search / filter box" },
  { keys: ["c"], action: "Create (hosted zone or record on the current page)" },
  { keys: ["g", "h"], action: "Go to Hosted zones" },
  { keys: ["g", "d"], action: "Go to Dashboard" },
  { keys: ["t"], action: "Toggle dark mode" },
  { keys: ["?"], action: "Show keyboard shortcuts" },
  { keys: ["Esc"], action: "Close dialog" },
];

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function useGlobalShortcuts(openHelp: () => void) {
  const router = useRouter();
  const { toggle } = useTheme();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return; // a modal is open

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        if (e.key === "h") router.push("/route53/v2/hostedzones");
        if (e.key === "d") router.push("/route53/v2/dashboard");
        return;
      }
      switch (e.key) {
        case "g":
          pendingG.current = window.setTimeout(() => (pendingG.current = null), 1000);
          break;
        case "/": {
          const input = document.querySelector<HTMLInputElement>('[data-shortcut="search"] input');
          if (input) {
            e.preventDefault();
            input.focus();
          }
          break;
        }
        case "c": {
          const btn = document.querySelector<HTMLElement>('[data-shortcut="create"]');
          if (btn) {
            e.preventDefault();
            btn.click();
          }
          break;
        }
        case "t":
          toggle();
          break;
        case "?":
          openHelp();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, toggle, openHelp]);
}

export function ShortcutsModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Keyboard shortcuts" size="medium">
      <Table
        variant="embedded"
        items={SHORTCUTS}
        columnDefinitions={[
          {
            id: "keys",
            header: "Keys",
            cell: (s) => (
              <Box>
                {s.keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && " then "}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </Box>
            ),
          },
          { id: "action", header: "Action", cell: (s) => s.action },
        ]}
      />
    </Modal>
  );
}
