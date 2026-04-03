import { useEffect } from "react";
import { useLayoutStore } from "../stores/layoutStore";

// Bindings here must match COMMAND_DEFINITIONS in useCommandRegistry.ts.
// This hook handles the actual keydown events; the registry is the source
// of truth for IDs, labels, and display text.
export function useMainLayoutShortcuts() {
  useEffect(() => {
    const ls = useLayoutStore.getState;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        ls().setQuickSwitcherOpen(!ls().quickSwitcherOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        ls().setSettingsOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "L") {
        e.preventDefault();
        ls().toggleAiChat();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "I") {
        e.preventDefault();
        ls().toggleInspector();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        ls().toggleHistory();
      }
      if (e.key === "F1") {
        e.preventDefault();
        ls().setHelpOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        ls().setCommandPaletteOpen(!ls().commandPaletteOpen);
      }


    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
