"use client";
// Dark mode via Cloudscape's applyMode(), which swaps its design tokens. Preference kept per browser.
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { readPref, writePref } from "@/lib/storage";

const ThemeContext = createContext<{ dark: boolean; toggle: () => void }>({ dark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(readPref("r53.dark", false));
  }, []);

  useEffect(() => {
    applyMode(dark ? Mode.Dark : Mode.Light);
  }, [dark]);

  const toggle = useCallback(() => {
    setDark((d) => {
      writePref("r53.dark", !d);
      return !d;
    });
  }, []);

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
