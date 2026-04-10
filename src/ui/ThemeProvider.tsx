"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [loaded, setLoaded] = useState(false);

  // Load saved theme from API
  useEffect(() => {
    fetch("/api/pengaturan")
      .then((r) => r.json())
      .then((json) => {
        const saved = json.settings?.theme as Theme | undefined;
        if (saved && ["light", "dark", "system"].includes(saved)) {
          setThemeState(saved);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Apply theme to <html>
  useEffect(() => {
    if (!loaded) return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent | MediaQueryList) => {
        if (e.matches) root.classList.add("dark");
        else root.classList.remove("dark");
      };
      handler(mq);
      mq.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
      return () => mq.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
    }
  }, [theme, loaded]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
