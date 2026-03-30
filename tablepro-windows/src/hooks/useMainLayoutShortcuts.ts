import { useEffect } from "react";
import { useLayoutStore } from "../stores/layoutStore";

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
        ls().toggleFilter();
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
