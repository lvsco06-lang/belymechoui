import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, type ThemeMode } from "@/lib/theme";

const ORDER: ThemeMode[] = ["system", "light", "dark"];

const ICONS: Record<ThemeMode, typeof Sun> = {
  system: SunMoon,
  light: Sun,
  dark: Moon,
};

const LABELS: Record<ThemeMode, string> = {
  system: "Système",
  light: "Clair",
  dark: "Sombre",
};

/** Bascule clair / sombre / système. Cycle au clic, mémorise le choix. */
export function ThemeToggle({ className }: { className?: string }) {
  // Rendu SSR neutre ("système") puis synchronisé au montage pour éviter tout mismatch d'hydratation.
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    setMode(getStoredTheme());
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length] ?? "system";
    setMode(next);
    applyTheme(next);
  }

  const Icon = ICONS[mode];

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Thème : ${LABELS[mode]}. Cliquer pour changer.`}
      title={`Thème : ${LABELS[mode]} (cliquer pour changer)`}
      className={className}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
