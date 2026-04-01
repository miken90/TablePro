import {
  ViewPlugin,
  Decoration,
  WidgetType,
  keymap,
  type EditorView,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { Prec, type Extension } from "@codemirror/state";
import { invoke } from "@tauri-apps/api/core";

// -- Ghost text widget -------------------------------------------------------

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.opacity = "0.4";
    span.style.fontStyle = "italic";
    span.className = "cm-ai-ghost-text";
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// -- ViewPlugin class --------------------------------------------------------

class AiInlineSuggestPlugin {
  decorations: DecorationSet = Decoration.none;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  currentSuggestion: string | null = null;
  private suggestionPos: number | null = null;

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet) {
      this.dismiss();
      if (update.docChanged) {
        this.scheduleRequest(update.view);
      }
    }
  }

  scheduleRequest(view: EditorView) {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      void this.fetchSuggestion(view);
    }, 500);
  }

  async fetchSuggestion(view: EditorView) {
    this.abortController?.abort();
    this.abortController = new AbortController();

    const pos = view.state.selection.main.head;
    const doc = view.state.doc.toString();
    const prefix = doc.slice(0, pos);
    const suffix = doc.slice(pos);

    // Don't suggest if cursor is in the middle of a word
    if (prefix.length > 0 && /\w$/.test(prefix) && /^\w/.test(suffix)) {
      return;
    }

    try {
      const suggestion: string = await invoke("ai_inline_suggest", {
        prefix,
        suffix,
      });

      // Check if view still valid and position hasn't changed
      if (
        view.state.selection.main.head !== pos ||
        !suggestion ||
        suggestion.trim() === ""
      ) {
        return;
      }

      this.currentSuggestion = suggestion;
      this.suggestionPos = pos;

      const widget = Decoration.widget({
        widget: new GhostTextWidget(suggestion),
        side: 1,
      });

      this.decorations = Decoration.set([widget.range(pos)]);
      view.dispatch(); // trigger re-render with new decorations
    } catch {
      // silently ignore — user may have typed, network error, etc.
    }
  }

  accept(view: EditorView): boolean {
    if (!this.currentSuggestion || this.suggestionPos === null) return false;

    const suggestion = this.currentSuggestion;
    const pos = this.suggestionPos;

    // Verify cursor is still at suggestion position
    if (view.state.selection.main.head !== pos) {
      this.dismiss();
      return false;
    }

    view.dispatch({
      changes: { from: pos, insert: suggestion },
      selection: { anchor: pos + suggestion.length },
    });

    this.dismiss();
    return true;
  }

  dismiss() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.abortController?.abort();
    this.abortController = null;
    this.currentSuggestion = null;
    this.suggestionPos = null;
    this.decorations = Decoration.none;
  }

  destroy() {
    this.dismiss();
  }
}

// -- Extension factory -------------------------------------------------------

const aiInlineSuggestPlugin = ViewPlugin.fromClass(AiInlineSuggestPlugin, {
  decorations: (v) => v.decorations,
});

const aiInlineSuggestKeymap = Prec.highest(
  keymap.of([
    {
      key: "Tab",
      run: (view) => {
        const plugin = view.plugin(aiInlineSuggestPlugin);
        if (plugin?.currentSuggestion) {
          return plugin.accept(view);
        }
        return false;
      },
    },
    {
      key: "Escape",
      run: (view) => {
        const plugin = view.plugin(aiInlineSuggestPlugin);
        if (plugin?.currentSuggestion) {
          plugin.dismiss();
          // Force decoration update
          view.dispatch();
          return true;
        }
        return false;
      },
    },
  ]),
);

/**
 * Creates the AI inline suggestion extension.
 * Returns an array of extensions (plugin + keymap) to be wrapped in a compartment.
 */
export function createAiInlineSuggestExtension(): Extension {
  return [aiInlineSuggestPlugin, aiInlineSuggestKeymap];
}
