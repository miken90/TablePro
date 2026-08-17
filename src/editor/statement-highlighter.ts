import { ViewPlugin, Decoration, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { type RangeSet } from "@codemirror/state";
import { locatedStatementAtCursor } from "./statement-scanner";

const lineHighlight = Decoration.line({ class: "cm-active-statement" });

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

      const from = Math.max(0, located.offset);
      const to = Math.min(located.offset + located.sql.length, view.state.doc.length);
      if (from >= to) return Decoration.none;

      // Create a line decoration for each line within the statement range
      const decorations: { from: number; value: typeof lineHighlight }[] = [];
      const startLine = view.state.doc.lineAt(from).number;
      const endLine = view.state.doc.lineAt(to).number;

      for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        const line = view.state.doc.line(lineNum);
        decorations.push({ from: line.from, value: lineHighlight });
      }

      return Decoration.set(
        decorations.map(d => d.value.range(d.from)),
        true,
      ) as RangeSet<typeof lineHighlight> as DecorationSet;
    }
  },
  { decorations: (v) => v.decorations },
);
