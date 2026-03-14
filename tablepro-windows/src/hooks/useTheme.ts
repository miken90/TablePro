import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";

function applyTheme(theme: string) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const editorFont = useSettingsStore((s) => s.settings.editorFont);
  const editorFontSize = useSettingsStore((s) => s.settings.editorFontSize);

  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font", `'${editorFont}', monospace`);
  }, [editorFont]);

  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font-size", `${editorFontSize}px`);
  }, [editorFontSize]);
}
