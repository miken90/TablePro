import { type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { vim, Vim, getCM } from '@replit/codemirror-vim';
import { useEditorStore } from '../stores/editorStore';
import { useQueryStore } from '../stores/queryStore';
import { useConnectionStore } from '../stores/connectionStore';

let exCommandsRegistered = false;

function registerExCommands(): void {
  if (exCommandsRegistered) return;
  exCommandsRegistered = true;

  // :w — execute current SQL
  Vim.defineEx('write', 'w', (cm) => {
    const sql = cm.getValue();
    const connectionId = useConnectionStore.getState().selectedConnectionId;
    if (!connectionId) return;
    const sessionId = useConnectionStore.getState().getSessionId(connectionId);
    if (!sessionId) return;
    useQueryStore.getState().execute(sessionId, sql).catch(() => {
      // errors handled inside execute()
    });
  });

  // :q — close active tab
  Vim.defineEx('quit', 'q', () => {
    const { activeTabId, closeTab } = useEditorStore.getState();
    if (activeTabId) closeTab(activeTabId);
  });

  // :e — open new tab
  Vim.defineEx('edit', 'e', () => {
    useEditorStore.getState().addTab();
  });
}

/**
 * Returns a CodeMirror 6 Extension that enables Vim keybindings.
 * Ex-commands (:w, :q, :e) are registered once globally.
 */
export function createVimExtension(): Extension {
  registerExCommands();
  return vim();
}

/**
 * Returns the current Vim mode string for the given EditorView.
 * Possible values: 'NORMAL', 'INSERT', 'VISUAL', 'COMMAND', or '' when vim is inactive.
 */
export function getVimMode(view: EditorView): string {
  const cm = getCM(view);
  if (!cm) return '';

  const vimState = cm.state.vim;
  if (!vimState) return '';

  if (vimState.exMode) return 'COMMAND';
  if (vimState.visualMode || vimState.visualLine || vimState.visualBlock) return 'VISUAL';
  if (vimState.insertMode) return 'INSERT';
  return 'NORMAL';
}
