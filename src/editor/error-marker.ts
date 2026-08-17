import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

/** Effect to set or clear the error position underline. */
export const setErrorMark = StateEffect.define<{ from: number; to: number } | null>();

const errorDecoration = Decoration.mark({
  class: "cm-error-mark",
});

/** StateField that provides a decoration for the error position. */
export const errorMarkerField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const e of tr.effects) {
      if (e.is(setErrorMark)) {
        if (e.value === null) return Decoration.none;
        return Decoration.set([errorDecoration.range(e.value.from, e.value.to)]);
      }
    }
    // Clear on document change (user started editing)
    if (tr.docChanged) return Decoration.none;
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});
