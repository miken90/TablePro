import { useEditorStore, type EditorTab } from "./editorStore";
import { useConnectionStore } from "./connectionStore";
import { useChangeStore } from "./changeStore";

/**
 * The one place that turns "which tab is active" into the side state other
 * stores need. The tab kind is the only view state: nothing here sets a view
 * mode, because there is none — `WorkspaceBody` derives what to render from
 * the active tab directly.
 *
 * Responsibility: scope `changeStore` to the active table tab, or release the
 * scope without touching any table's staged edits (`clearActiveTable`). The
 * right dock (M2) is tab-kind-agnostic — it stays wherever the user left it
 * across tab switches, so there is no inspector-visibility rule to apply here
 * any more (that per-tab-kind auto-hide/restore was retired with `dockOpen`/
 * `dockPane` replacing it, per the M2 plan's Risk Assessment).
 *
 * Every activation path must call this: tab click, keyboard tab switch, tab
 * close, quick switcher, sidebar open, preview table, history select, and the
 * restore of a persisted active tab at launch — the last one had no sync path
 * at all before this function existed.
 */
export function syncActiveTabContext(tabId: string | null): void {
  const tab = tabId ? useEditorStore.getState().tabs.find((t) => t.id === tabId) : undefined;
  if (tabId && !tab) return; // unknown id: nothing to sync, leave state alone

  if (tab && tab.type === "table" && tab.tableName) {
    const connectionId = tab.connectionId ?? useConnectionStore.getState().selectedConnectionId;
    if (connectionId) {
      useChangeStore.getState().setActiveTable(connectionId, tab.tableSchema ?? null, tab.tableName);
      return;
    }
  }

  useChangeStore.getState().clearActiveTable();
}

/** Create or focus the table-browse tab for a table and sync the side state. */
export function openTableTab(tableName: string, schema?: string | null): string {
  const id = useEditorStore.getState().addTableTab(tableName, schema);
  syncActiveTabContext(id);
  return id;
}

/** Create or focus the structure tab for a table (M1) and sync the side state. */
export function openStructureTab(tableName: string, schema?: string | null): string {
  const id = useEditorStore.getState().addStructureTab(tableName, schema);
  syncActiveTabContext(id);
  return id;
}

/**
 * Bring a query tab to the front: the active one if it already is a query
 * tab, else the most recent query tab, else a new one. Replaces the old
 * "switch to query mode" global, which showed the editor without changing
 * the active tab.
 */
export function activateQueryTab(): string {
  const editor = useEditorStore.getState();
  const active = editor.tabs.find((t) => t.id === editor.activeTabId);
  const isQueryKind = (t: EditorTab) => (t.type ?? "query") === "query";
  let target = active && isQueryKind(active) ? active : undefined;
  if (!target) target = [...editor.tabs].reverse().find(isQueryKind);
  const id = target ? target.id : editor.addTab();
  if (editor.activeTabId !== id) useEditorStore.getState().setActiveTab(id);
  syncActiveTabContext(id);
  return id;
}

let unsubscribeActiveTab: (() => void) | null = null;

/**
 * Make the tab the only view state *by construction*: every write to
 * `activeTabId` — tab click, Ctrl+Tab, Ctrl+W, close-others, vim `:q`,
 * FK navigation, a restore at launch — runs the sync, whether or not the
 * writer remembered to call it. The explicit calls above stay: they are
 * idempotent and let callers sync before their next line runs.
 */
export function installActiveTabSync(): () => void {
  unsubscribeActiveTab?.();
  unsubscribeActiveTab = useEditorStore.subscribe(
    (s) => s.activeTabId,
    (activeTabId) => syncActiveTabContext(activeTabId),
  );
  return () => {
    unsubscribeActiveTab?.();
    unsubscribeActiveTab = null;
  };
}

type CloseTabHandler = (tabId: string) => void;
let closeTabHandler: CloseTabHandler | null = null;

/**
 * The tab bar owns the "are you sure" dialogs for closing a tab (dirty
 * query, staged row edits — V3). Commands and vim `:q` must go through the
 * same guard instead of `closeTab` directly, so they register here.
 */
export function registerCloseTabHandler(handler: CloseTabHandler | null): void {
  closeTabHandler = handler;
}

/** Close a tab through the tab bar's guard when it is mounted; else directly. */
export function requestCloseTab(tabId: string): void {
  if (closeTabHandler) closeTabHandler(tabId);
  else useEditorStore.getState().closeTab(tabId);
}
