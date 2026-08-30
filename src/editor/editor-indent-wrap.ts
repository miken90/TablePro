import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";

/**
 * The two Settings > Editor options that shape the editor's text layout.
 *
 * Both are built here as plain extensions so the compartments in
 * `editor-compartments.ts` can swap them in place, and so the mapping from a
 * setting value to CodeMirror facets can be asserted without standing up an
 * EditorView.
 */

/**
 * Indentation width, in spaces.
 *
 * Two facets have to agree or the editor contradicts itself:
 * `EditorState.tabSize` decides how wide an existing tab character renders,
 * and `indentUnit` decides what gets inserted when something indents — the
 * `indentWithTab` keymap and `indentOnInput` both read it. Setting only the
 * first would leave Tab inserting CodeMirror's default two spaces regardless
 * of the setting.
 *
 * `indentUnit` is a string of spaces rather than a tab character: this editor
 * indents with spaces, which is what the setting offers (2, 4 or 8).
 */
export function buildIndentExtension(tabSize: number): Extension {
  return [
    EditorState.tabSize.of(tabSize),
    indentUnit.of(" ".repeat(tabSize)),
  ];
}

/**
 * Soft line wrapping. Off is the empty extension rather than an explicit
 * "no wrap" — CodeMirror's default is already no wrapping, so removing the
 * extension is what turns it off.
 */
export function buildWordWrapExtension(wordWrap: boolean): Extension {
  return wordWrap ? EditorView.lineWrapping : [];
}
