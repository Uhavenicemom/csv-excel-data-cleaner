const THEME_STORAGE_KEY = "data-cleaner-theme";

type Theme = "light" | "dark";

export interface ThemeController {
  initialize(): void;
  toggle(): void;
  dispose(): void;
}

interface ThemeElements {
  toggle: HTMLButtonElement;
  label: HTMLElement;
}

function savedTheme(): Theme | null {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return theme === "dark" || theme === "light" ? theme : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function createThemeController(
  elements: ThemeElements,
  announce: (message: string) => void
): ThemeController {
  const preference = window.matchMedia?.("(prefers-color-scheme: dark)");

  const apply = (theme: Theme, options: { save?: boolean; announceChange?: boolean } = {}): void => {
    document.documentElement.dataset.theme = theme;
    const isDark = theme === "dark";
    const nextAction = isDark ? "light" : "dark";
    elements.toggle.setAttribute("aria-pressed", String(isDark));
    elements.toggle.setAttribute("aria-label", `Switch to ${nextAction} theme`);
    elements.toggle.title = `Switch to ${nextAction} theme`;
    elements.label.textContent = isDark ? "Light" : "Dark";
    if (options.save) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // The selected theme still applies to this tab when storage is unavailable.
      }
    }
    if (options.announceChange) announce(`${isDark ? "Dark" : "Light"} theme enabled.`);
  };

  const onSystemThemeChange = (event: MediaQueryListEvent): void => {
    if (!savedTheme()) apply(event.matches ? "dark" : "light");
  };

  return {
    initialize(): void {
      const initial = document.documentElement.dataset.theme;
      apply(initial === "dark" || initial === "light" ? initial : savedTheme() ?? systemTheme());
      preference?.addEventListener("change", onSystemThemeChange);
    },
    toggle(): void {
      apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark", {
        save: true,
        announceChange: true
      });
    },
    dispose(): void {
      preference?.removeEventListener("change", onSystemThemeChange);
    }
  };
}
