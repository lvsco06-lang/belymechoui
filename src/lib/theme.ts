// Thème clair/sombre : automatique (suit l'OS) ou forcé manuellement.
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "belyme-theme";

/** Choix mémorisé, ou "system" si aucun (défaut : suit l'OS). */
export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

/**
 * Applique le thème au document et mémorise le choix.
 * "system" retire tout choix explicite : le CSS (prefers-color-scheme)
 * reprend la main et suit l'OS automatiquement, y compris en direct si
 * l'utilisateur change son thème système sans recharger la page.
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (mode !== "system") root.classList.add(mode);
  try {
    if (mode === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Navigation privée ou stockage plein : le choix ne persiste pas pour cette session, sans gravité.
  }
}

/**
 * Script à injecter en tout début de <head>, avant le rendu, pour poser la
 * bonne classe avant la première peinture (évite le flash du mauvais thème).
 * Ne fait rien si l'utilisateur n'a jamais fait de choix explicite : le CSS
 * gère alors l'automatique tout seul.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(m==='light'||m==='dark'){document.documentElement.classList.add(m);}}catch(e){}})();`;
