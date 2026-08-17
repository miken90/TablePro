import { createContext, useContext, useRef, type MutableRefObject, type ReactNode } from "react";
import type { EditorView } from "@codemirror/view";

interface EditorViewContextValue {
  viewRef: MutableRefObject<EditorView | null>;
}

const EditorViewContext = createContext<EditorViewContextValue | null>(null);

export function EditorViewProvider({ children }: { children: ReactNode }) {
  const viewRef = useRef<EditorView | null>(null);
  return (
    <EditorViewContext.Provider value={{ viewRef }}>
      {children}
    </EditorViewContext.Provider>
  );
}

/**
 * Returns the shared EditorView ref. Safe to call outside EditorViewProvider —
 * returns a standalone ref (always null) when no provider is present.
 */
export function useEditorViewRef(): MutableRefObject<EditorView | null> {
  const ctx = useContext(EditorViewContext);
  const fallbackRef = useRef<EditorView | null>(null);
  if (!ctx) return fallbackRef;
  return ctx.viewRef;
}
