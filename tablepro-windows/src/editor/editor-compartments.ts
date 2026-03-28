import { Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Module-level compartments for dynamic editor reconfiguration.
 * Since there's only ONE EditorView at a time (shared across tabs),
 * module-level singletons are correct. When we build extensions for
 * a new tab state, we wrap configurable extensions in these same
 * compartments. Reconfigure dispatches then work on the single view.
 */
export const fontCompartment = new Compartment();
export const vimCompartment = new Compartment();
export const dialectCompartment = new Compartment();
export const highlightCompartment = new Compartment();

/** Reconfigure font family and size in-place (preserves undo history). */
export function reconfigureFont(
  view: EditorView,
  fontTheme: Extension,
): void {
  view.dispatch({
    effects: fontCompartment.reconfigure(fontTheme),
  });
}

/** Reconfigure vim mode on/off in-place. */
export function reconfigureVim(
  view: EditorView,
  vimExtension: Extension,
): void {
  view.dispatch({
    effects: vimCompartment.reconfigure(vimExtension),
  });
}

/** Reconfigure SQL dialect in-place. */
export function reconfigureDialect(
  view: EditorView,
  dialectExtension: Extension,
): void {
  view.dispatch({
    effects: dialectCompartment.reconfigure(dialectExtension),
  });
}

/** Reconfigure syntax highlighting (light/dark) in-place. */
export function reconfigureHighlight(
  view: EditorView,
  highlightExtension: Extension,
): void {
  view.dispatch({
    effects: highlightCompartment.reconfigure(highlightExtension),
  });
}
