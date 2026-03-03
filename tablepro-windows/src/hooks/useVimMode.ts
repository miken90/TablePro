import { useEffect, useRef, useState, useCallback } from "react";
import type { editor as monacoEditor } from "monaco-editor";

type VimModeType = "NORMAL" | "INSERT" | "VISUAL" | "REPLACE";

interface UseVimModeResult {
  enabled: boolean;
  mode: VimModeType;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
}

export function useVimMode(
  editorRef: React.RefObject<monacoEditor.IStandaloneCodeEditor | null>,
  initialEnabled: boolean = false,
): UseVimModeResult {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [mode, setMode] = useState<VimModeType>("NORMAL");
  const vimModeRef = useRef<ReturnType<typeof import("monaco-vim").initVimMode> | null>(null);
  const statusBarRef = useRef<HTMLDivElement | null>(null);

  const initVim = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    try {
      const { initVimMode } = await import("monaco-vim");

      // Create a hidden status container for vim mode
      if (!statusBarRef.current) {
        statusBarRef.current = document.createElement("div");
        statusBarRef.current.style.display = "none";
        document.body.appendChild(statusBarRef.current);
      }

      vimModeRef.current = initVimMode(editor, statusBarRef.current);

      // Listen for mode changes via the status bar content
      const observer = new MutationObserver(() => {
        const text = statusBarRef.current?.textContent?.toUpperCase() ?? "";
        if (text.includes("INSERT")) setMode("INSERT");
        else if (text.includes("VISUAL")) setMode("VISUAL");
        else if (text.includes("REPLACE")) setMode("REPLACE");
        else setMode("NORMAL");
      });

      if (statusBarRef.current) {
        observer.observe(statusBarRef.current, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }

      setMode("NORMAL");
    } catch {
      // monaco-vim not available
    }
  }, [editorRef]);

  const disposeVim = useCallback(() => {
    if (vimModeRef.current) {
      vimModeRef.current.dispose();
      vimModeRef.current = null;
    }
    setMode("NORMAL");
  }, []);

  useEffect(() => {
    if (enabled) {
      initVim();
    } else {
      disposeVim();
    }
    return () => {
      disposeVim();
    };
  }, [enabled, initVim, disposeVim]);

  const enable = useCallback(() => setEnabled(true), []);
  const disable = useCallback(() => setEnabled(false), []);
  const toggle = useCallback(() => setEnabled((v) => !v), []);

  return { enabled, mode, enable, disable, toggle };
}
