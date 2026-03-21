import { ViewPlugin, Decoration, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { locatedStatementAtCursor } from "./statement-scanner";

const statementHighlightMark = Decoration.mark({
  class: "cm-active-statement",
});

export const statementHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.compute(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = this.compute(update.view);
      }
    }

    compute(view: EditorView): DecorationSet {
      const cursor = view.state.selection.main.head;
      const doc = view.state.doc.toString();
      if (!doc.trim()) return Decoration.none;

      const located = locatedStatementAtCursor(doc, cursor);
      if (!located.sql.trim()) return Decoration.none;

      const from = located.offset;
      const to = located.offset + located.sql.length;

      // Clamp to document bounds
      const clampedFrom = Math.max(0, from);
      const clampedTo = Math.min(to, view.state.doc.length);
      if (clampedFrom >= clampedTo) return Decoration.none;

      return Decoration.set([statementHighlightMark.range(clampedFrom, clampedTo)]);
    }
  },
  { decorations: (v) => v.decorations },
);
