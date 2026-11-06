"use client";

import { useSyncExternalStore } from "react";

type Preference = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const OPTIONS: { value: Preference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const listeners = new Set<() => void>();

function readPreference(): Preference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

// Same logic as the inline script in app/layout.tsx.
function applyTheme(preference: Preference) {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function setPreference(preference: Preference) {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage can be blocked; the choice still applies to this page view.
  }
  applyTheme(preference);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  // Follows OS changes in System mode, and choices made in other tabs.
  const sync = () => {
    applyTheme(readPreference());
    listener();
  };
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", sync);
  window.addEventListener("storage", sync);

  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", sync);
    window.removeEventListener("storage", sync);
  };
}

export default function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system");

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex shrink-0 rounded border border-zinc-300 text-xs dark:border-zinc-700"
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
          className="px-2 py-1 text-zinc-600 hover:text-zinc-900 aria-pressed:bg-zinc-200 aria-pressed:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-800 dark:aria-pressed:text-zinc-100"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
