// @vitest-environment jsdom
/**
 * F7 — Settings > Editor's "Tab size" and "Word wrap" reached the settings
 * file and stopped there: both values were written, persisted and read back
 * by the Settings pane, and no CodeMirror extension anywhere consumed them.
 * These pin the mapping from a setting value to the facets that actually
 * change the editor, and that swapping it keeps the document.
 */

import { describe, expect, it } from 'vitest';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { buildIndentExtension, buildWordWrapExtension } from './editor-indent-wrap';

function stateWith(tabSize: number, wordWrap: boolean, doc = 'select 1;') {
  return EditorState.create({
    doc,
    extensions: [buildIndentExtension(tabSize), buildWordWrapExtension(wordWrap)],
  });
}

describe('tab size drives both indentation facets', () => {
  it('a tab size of 2 sets EditorState.tabSize and a two-space indentUnit', () => {
    const state = stateWith(2, false);
    expect(state.tabSize).toBe(2);
    expect(state.facet(indentUnit)).toBe('  ');
  });

  it('a tab size of 8 sets EditorState.tabSize and an eight-space indentUnit', () => {
    const state = stateWith(8, false);
    expect(state.tabSize).toBe(8);
    expect(state.facet(indentUnit)).toBe('        ');
  });

  it('the two facets never disagree — indentUnit is always tabSize spaces', () => {
    for (const size of [2, 4, 8]) {
      const state = stateWith(size, false);
      expect(state.facet(indentUnit)).toHaveLength(state.tabSize);
    }
  });
});

describe('word wrap toggles line wrapping', () => {
  /** `EditorView.lineWrapping` is a theme extension; it shows up as the
   *  cm-lineWrapping class the view adds when the extension is present. */
  function wraps(wordWrap: boolean): boolean {
    const view = new EditorView({
      state: stateWith(4, wordWrap),
    });
    try {
      return view.contentDOM.classList.contains('cm-lineWrapping');
    } finally {
      view.destroy();
    }
  }

  it('is present when wordWrap is on', () => {
    expect(wraps(true)).toBe(true);
  });

  it('is absent when wordWrap is off', () => {
    expect(wraps(false)).toBe(false);
  });
});

describe('reconfiguring through a compartment keeps the document', () => {
  it('changing tab size and word wrap live preserves doc and selection', () => {
    const indent = new Compartment();
    const wrap = new Compartment();
    const doc = 'select a\nfrom t;';

    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [indent.of(buildIndentExtension(2)), wrap.of(buildWordWrapExtension(false))],
      }),
    });

    try {
      view.dispatch({ selection: { anchor: 3, head: 6 } });
      expect(view.state.tabSize).toBe(2);
      expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(false);

      view.dispatch({
        effects: [
          indent.reconfigure(buildIndentExtension(8)),
          wrap.reconfigure(buildWordWrapExtension(true)),
        ],
      });

      // The whole point of the compartment: new config, same document.
      expect(view.state.doc.toString()).toBe(doc);
      expect(view.state.selection.main.anchor).toBe(3);
      expect(view.state.selection.main.head).toBe(6);
      expect(view.state.tabSize).toBe(8);
      expect(view.state.facet(indentUnit)).toBe('        ');
      expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
    } finally {
      view.destroy();
    }
  });
});

/**
 * The unit tests above prove the builders map settings to facets. This proves
 * the editor actually calls them — without it the wiring could be deleted and
 * every assertion above would still pass, which is exactly the shape of the
 * original defect (a setting that was read and then consumed by nothing).
 */
describe('the SQL editor consumes both settings', () => {
  const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  const editor = () => {
    const text = SOURCES['/src/components/editor/sql-editor.tsx'];
    if (text === undefined) throw new Error('sql-editor.tsx not found');
    return text;
  };

  it('reads settings.wordWrap and settings.tabSize', () => {
    expect(editor()).toContain('settings.wordWrap');
    expect(editor()).toContain('settings.tabSize');
  });

  it('puts both in compartments so they reconfigure without a remount', () => {
    expect(editor()).toContain('wordWrapCompartment.of(buildWordWrapExtension(settings.wordWrap))');
    expect(editor()).toContain('indentCompartment.of(buildIndentExtension(settings.tabSize))');
  });

  it('reconfigures both when the setting changes and when a tab is restored', () => {
    // Two call sites: the settings-change effect and the tab-restore effect.
    expect(editor().match(/reconfigureWordWrap\(/g) ?? []).toHaveLength(2);
    expect(editor().match(/reconfigureIndent\(/g) ?? []).toHaveLength(2);
  });

  it('no longer leaves either setting consumed by nothing outside Settings', () => {
    const consumers = Object.entries(SOURCES)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([path]) => !path.includes('/settings/'))
      .filter(([path]) => !path.includes('/types/settings'))
      .filter(([path]) => !path.includes('/stores/settingsStore'))
      .filter(([, text]) => text.includes('wordWrap') || text.includes('tabSize'))
      .map(([path]) => path);
    expect(consumers).toContain('/src/components/editor/sql-editor.tsx');
    expect(consumers).toContain('/src/editor/editor-indent-wrap.ts');
  });
});
