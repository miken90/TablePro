import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Creates a CodeMirror theme that reads from CSS variables defined in globals.css.
 * Supports both light and dark mode automatically via the CSS variable system.
 */
export function createEditorTheme(): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--editor-bg)",
      color: "var(--editor-fg)",
    },
    ".cm-content": {
      caretColor: "var(--editor-fg)",
      fontFamily: "inherit",
      fontSize: "inherit",
      padding: "8px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--editor-fg)",
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
      fontSize: "inherit",
      lineHeight: "1.5",
    },
    // Gutters
    ".cm-gutters": {
      backgroundColor: "var(--gutter-bg)",
      color: "var(--gutter-fg)",
      border: "none",
      borderRight: "1px solid var(--border)",
      userSelect: "none",
    },
    ".cm-gutter": {
      minWidth: "2.5em",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 4px",
      color: "var(--gutter-fg)",
      minWidth: "2em",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--active-line-bg)",
      color: "var(--editor-fg)",
    },
    // Active line
    ".cm-activeLine": {
      backgroundColor: "var(--active-line-bg)",
    },
    // Selection
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--selection-match-bg)",
    },
    ".cm-selectionMatch": {
      backgroundColor: "var(--selection-match-bg)",
      outline: "1px solid var(--border)",
    },
    // Search panel
    ".cm-panels": {
      backgroundColor: "var(--gutter-bg)",
      color: "var(--editor-fg)",
      borderTop: "1px solid var(--border)",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid var(--border)",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--selection-match-bg)",
      outline: "1px solid var(--border)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "var(--active-line-bg)",
      outline: "1px solid var(--editor-fg)",
    },
    // Bracket matching
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      fontWeight: "bold",
    },
    ".cm-matchingBracket": {
      backgroundColor: "var(--selection-match-bg)",
      outline: "1px solid var(--gutter-fg)",
    },
    // Fold gutter
    ".cm-foldGutter .cm-gutterElement": {
      cursor: "pointer",
    },
    // Tooltip (autocomplete)
    ".cm-tooltip": {
      backgroundColor: "var(--gutter-bg)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      maxHeight: "220px",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--active-line-bg)",
      color: "var(--editor-fg)",
    },
    ".cm-completionLabel": {
      color: "var(--editor-fg)",
    },
    ".cm-completionDetail": {
      color: "var(--gutter-fg)",
      fontStyle: "italic",
    },
  });
}

/**
 * Dynamic font theme — call when font or size settings change.
 */
export function createEditorFontTheme(font: string, size: number): Extension {
  return EditorView.theme({
    ".cm-content, .cm-gutter": {
      fontFamily: `${font}, Consolas, 'Courier New', monospace`,
      fontSize: `${size}px`,
    },
  });
}
