/**
 * Editor status derivation.
 *
 * The status bar used to poll the editor every 100 ms; it now reads what
 * these functions publish from CodeMirror update events. The scan cache is
 * module-level, so each case drives it through `syncFrom` in order.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { useEditorStatusStore } from "./editorStatusStore";

const DOC = "SELECT 1;\nSELECT 2;\nSELECT 3;";

function stateAt(head: number, doc = DOC): EditorState {
  return EditorState.create({ doc, selection: { anchor: head } });
}

describe("editorStatusStore", () => {
  beforeEach(() => useEditorStatusStore.getState().reset());

  it("reports line and column for the cursor", () => {
    // Offset 12 is on line 2 ("SELECT 2;"), third character.
    useEditorStatusStore.getState().syncFrom(stateAt(12), true);
    const s = useEditorStatusStore.getState();
    expect(s.line).toBe(2);
    expect(s.col).toBe(3);
    expect(s.selected).toBe(0);
  });

  it("counts statements and locates the one under the cursor", () => {
    useEditorStatusStore.getState().syncFrom(stateAt(22), true);
    const s = useEditorStatusStore.getState();
    expect(s.statementCount).toBe(3);
    expect(s.statementIndex).toBe(3);
  });

  it("reports the selection length", () => {
    const state = EditorState.create({
      doc: DOC,
      selection: { anchor: 0, head: 9 },
    });
    useEditorStatusStore.getState().syncFrom(state, true);
    expect(useEditorStatusStore.getState().selected).toBe(9);
  });

  // Control: a cursor-only update must still track the new position using
  // the cached scan, so a listener that ignores `selectionSet` fails here.
  it("tracks cursor moves without a document rescan", () => {
    const store = useEditorStatusStore.getState();
    store.syncFrom(stateAt(0), true);
    expect(useEditorStatusStore.getState().statementIndex).toBe(1);
    store.syncFrom(stateAt(12), false);
    const s = useEditorStatusStore.getState();
    expect(s.line).toBe(2);
    expect(s.statementIndex).toBe(2);
    expect(s.statementCount).toBe(3);
  });

  it("reset clears the published status", () => {
    const store = useEditorStatusStore.getState();
    store.syncFrom(stateAt(22), true);
    store.reset();
    const s = useEditorStatusStore.getState();
    expect(s.line).toBe(1);
    expect(s.col).toBe(1);
    expect(s.statementCount).toBe(0);
  });
});
