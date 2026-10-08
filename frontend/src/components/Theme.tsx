"use client";
// Visual mode: Light, Dark or Browser default (follows the OS via prefers-color-scheme), like the console's
// "Current user settings". Cloudscape's applyMode() swaps its design tokens. The choice is kept per browser;
// THEME_SCRIPT (lib/theme.ts, run from the root layout) applies it before the first paint.
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { readPref, writePref } from "@/lib/storage";
import { DARK_QUERY, OLD_DARK_KEY, VISUAL_MODE_KEY, type VisualMode } from "@/lib/theme";

function savedMode(): VisualMode {
  const mode = readPref<VisualMode | null>(VISUAL_MODE_KEY, null);
  if (mode === "system" || mode === "light" || mode === "dark") return mode;
  return readPref(OLD_DARK_KEY, false) ? "dark" : "light";
}

function systemDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

interface ThemeCtx {
  mode: VisualMode;
  dark: boolean; // what is shown right now
  setMode: (mode: VisualMode) => void;
  toggle: () => void; // the "t" shortcut: switch between light and dark
}

const ThemeContext = createContext<ThemeCtx>({ mode: "light", dark: false, setMode: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read straight away in the browser, so the first applyMode() call agrees with THEME_SCRIPT (no flash).
  // Nothing rendered on the server depends on these: console pages render only in the browser (D-61).
  const inBrowser = typeof window !== "undefined";
  const [mode, setModeState] = useState<VisualMode>(() => (inBrowser ? savedMode() : "light"));
  const [osDark, setOsDark] = useState(() => inBrowser && systemDark());

  useEffect(() => {
    try {
      const query = window.matchMedia(DARK_QUERY);
      const onChange = (e: MediaQueryListEvent) => setOsDark(e.matches);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    } catch {
      return undefined;
    }
  }, []);

  const dark = mode === "dark" || (mode === "system" && osDark);

  useEffect(() => {
    applyMode(dark ? Mode.Dark : Mode.Light);
  }, [dark]);

  const setMode = useCallback((next: VisualMode) => {
    writePref(VISUAL_MODE_KEY, next);
    setModeState(next);
  }, []);

  const toggle = useCallback(() => setMode(dark ? "light" : "dark"), [dark, setMode]);

  return <ThemeContext.Provider value={{ mode, dark, setMode, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
