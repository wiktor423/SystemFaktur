"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "gumijagoda.theme";

interface ThemeApi {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

/**
 * Skrypt uruchamiany przed pierwszym malowaniem — ustawia klasę `dark`
 * zanim React przejmie stronę, dzięki czemu nie widać przebłysku jasnego tła.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch (error) {}
})();
`;

function applyTheme(preference: ThemePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = preference === "dark" || (preference === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (stored) setPreferenceState(stored);
  }, []);

  useEffect(() => {
    applyTheme(preference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(preference);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme musi być użyty wewnątrz <ThemeProvider>.");
  return context;
}

/**
 * `toggle` — na co przełącza ponowne kliknięcie aktywnej opcji. Dzięki temu
 * przycisk trybu ciemnego działa jak włącznik: klik włącza, kolejny wyłącza.
 */
const options: Array<{ value: ThemePreference; label: string; icon: typeof Sun; toggle: ThemePreference }> = [
  { value: "light", label: "Jasny", icon: Sun, toggle: "dark" },
  { value: "dark", label: "Ciemny", icon: Moon, toggle: "light" },
  { value: "system", label: "Systemowy", icon: Monitor, toggle: "system" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5", className)}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            title={
              active && option.toggle !== option.value
                ? `Motyw: ${option.label.toLowerCase()} — kliknij, aby wyłączyć`
                : `Motyw: ${option.label.toLowerCase()}`
            }
            aria-label={`Motyw ${option.label.toLowerCase()}`}
            aria-pressed={active}
            onClick={() => setPreference(active ? option.toggle : option.value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-[7px] transition-colors",
              active ? "bg-surface text-fg shadow-panel" : "text-fg-subtle hover:text-fg",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
