import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#0550ae" },
  { tag: tags.string, color: "#0a3069" },
  { tag: tags.number, color: "#0550ae" },
  { tag: tags.comment, color: "#6e7781", fontStyle: "italic" },
  { tag: tags.operator, color: "#cf222e" },
  { tag: tags.typeName, color: "#8250df" },
  { tag: tags.function(tags.variableName), color: "#8250df" },
  { tag: tags.bool, color: "#0550ae" },
  { tag: tags.null, color: "#6e7781" },
]);

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#ff7b72" },
  { tag: tags.string, color: "#a5d6ff" },
  { tag: tags.number, color: "#79c0ff" },
  { tag: tags.comment, color: "#8b949e", fontStyle: "italic" },
  { tag: tags.operator, color: "#ff7b72" },
  { tag: tags.typeName, color: "#d2a8ff" },
  { tag: tags.function(tags.variableName), color: "#d2a8ff" },
  { tag: tags.bool, color: "#79c0ff" },
  { tag: tags.null, color: "#8b949e" },
]);

export function createSyntaxHighlighting(isDark: boolean): Extension {
  return syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle);
}

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
      lineHeight: "21px",
    },
    // Gutters
    ".cm-gutters": {
      backgroundColor: "var(--gutter-bg)",
      color: "var(--gutter-fg)",
      border: "none",
      borderRight: "1px solid var(--color-border)",
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
      lineHeight: "21px",
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
      outline: "1px solid var(--color-border)",
    },
    // Search panel
    ".cm-panels": {
      backgroundColor: "var(--gutter-bg)",
      color: "var(--editor-fg)",
      borderTop: "1px solid var(--color-border)",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid var(--color-border)",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--selection-match-bg)",
      outline: "1px solid var(--color-border)",
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
      border: "1px solid var(--color-border)",
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
