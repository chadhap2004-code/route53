"use client";
// "Current user settings" panel that opens under the top bar's gear icon, laid out like the console's.
// Only Visual mode works; Language is shown disabled and "See all user settings" opens a coming-soon page.
// The awsui-context-top-navigation class gives the Cloudscape components inside the top bar's dark colours.
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import Link from "@cloudscape-design/components/link";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Select from "@cloudscape-design/components/select";
import { useEffect, useRef, useState } from "react";
import { useFollow } from "@/lib/useFollow";
import type { VisualMode } from "@/lib/theme";
import { useTheme } from "./Theme";

const WIDTH = 340;

/** The visible gear button (the top bar also renders hidden copies to measure its layout). */
export function settingsButton(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('#top-nav [aria-label="Settings"]'));
  return buttons.find((b) => !b.closest('[aria-hidden="true"]') && b.offsetParent !== null) ?? null;
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { mode, setMode } = useTheme();
  const follow = useFollow();
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 56, right: 16 });

  // Sit under the gear icon; on a phone the gear is in the "More" menu, so stay at the top right.
  useEffect(() => {
    const rect = settingsButton()?.getBoundingClientRect();
    if (rect) {
      const right = Math.max(8, window.innerWidth - rect.right - 48);
      setPosition({ top: rect.bottom + 2, right: Math.min(right, window.innerWidth - WIDTH - 8) });
    }
    panel.current?.focus();
  }, []);

  // Close on Escape or a click outside the panel (a click on the gear itself toggles it in ConsoleShell).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (panel.current?.contains(target) || settingsButton()?.contains(target)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  return (
    <div
      ref={panel}
      className="awsui-context-top-navigation settings-panel"
      role="dialog"
      aria-label="Current user settings"
      tabIndex={-1}
      style={{ top: position.top, right: position.right, width: WIDTH }}
    >
      <div className="settings-panel-header">
        <Box variant="h2" padding="n">
          Current user settings
        </Box>
      </div>
      <div className="settings-panel-body">
        <FormField label="Language">
          <Select
            disabled
            selectedOption={{ value: "default", label: "Browser default" }}
            options={[{ value: "default", label: "Browser default" }]}
            ariaLabel="Language (not available in this clone)"
          />
        </FormField>
        <FormField
          label={
            <>
              Visual mode - <i>beta</i>
            </>
          }
        >
          <RadioGroup
            value={mode}
            onChange={(e) => setMode(e.detail.value as VisualMode)}
            ariaLabel="Visual mode"
            items={[
              { value: "system", label: "Browser default" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </FormField>
      </div>
      <div className="settings-panel-footer">
        <Link
          href="/route53/v2/settings"
          fontSize="heading-xs"
          onFollow={(e) => {
            follow(e);
            onClose();
          }}
        >
          See all user settings
        </Link>
      </div>
    </div>
  );
}
