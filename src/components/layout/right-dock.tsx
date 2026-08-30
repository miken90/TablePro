import { lazy, Suspense, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TabStrip, IconButton } from "../ui";
import { InspectorPanel } from "../inspector/inspector-panel";
import { HistoryPanel } from "../history/HistoryPanel";
import { PanelLoader } from "../shared/PanelLoader";
import { useDockStore, DOCK_MIN, DOCK_MAX, type DockPane } from "../../stores/dock-store";
import { useResizable } from "../../hooks/useResizable";
import { useQueryStore } from "../../stores/queryStore";
import { useInspectorStore } from "../../stores/inspectorStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useTableCallbacks } from "../../hooks/useTableCallbacks";

const AiChatPanel = lazy(() => import("../ai/ai-chat-panel").then((m) => ({ default: m.AiChatPanel })));

/** Resizer grip — same look as the sidebar/dock splitters elsewhere in the shell. */
function SplitterGrip() {
  return (
    <div className="flex flex-col gap-1 opacity-40 group-hover:opacity-70">
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
    </div>
  );
}

/**
 * Esc closes the dock, and the dock is the LAST claimant of the key
 * (§6.3: popover → palette → dialog → dock). Two things make that ordering
 * real rather than assumed:
 *
 * 1. A higher layer that is actually open has already claimed the event via
 *    its own focus-trapped Esc handler, which calls `preventDefault` and
 *    `stopPropagation` before this ever sees it. [RT-9]
 * 2. Focus must be inside the dock. This listener sits on `window` next to
 *    the global shortcut dispatcher, and it registers first — `RightDock`
 *    is a child of `MainLayout`, whose effects run after its children's. A
 *    dock that claimed every Escape would `preventDefault` the key before
 *    the dispatcher ran, and the dispatcher bails on `defaultPrevented`, so
 *    `editor.cancel` (Cancel Query, also bound to Escape) would never fire.
 *    Escape aimed anywhere else falls through untouched.
 *
 * Exported so the claim decision can be exercised directly in tests, the way
 * `createShortcutHandler` is. Returns whether it claimed the event.
 */
export function createDockEscapeHandler(
  container: () => HTMLElement | null,
  close: () => void,
): (e: KeyboardEvent) => boolean {
  return (e: KeyboardEvent): boolean => {
    if (e.key !== "Escape" || e.defaultPrevented) return false;
    const el = container();
    if (!el || !el.contains(document.activeElement)) return false;
    e.preventDefault();
    close();
    return true;
  };
}

interface RightDockProps {
  isConnected: boolean;
}

/**
 * M2 — Inspector, History and AI Chat collapse into one persistent,
 * resizable dock with per-pane remembered widths (Q3). No scrim, no
 * click-away close: a dock is a column, not a modal (design-spec 5.16).
 *
 * Mounted once outside `WorkspaceBody`, so it survives tab switches.
 */
export function RightDock({ isConnected }: RightDockProps) {
  const { t } = useTranslation();
  const dockOpen = useDockStore((s) => s.dockOpen);
  const dockPane = useDockStore((s) => s.dockPane);
  const width = useDockStore((s) => s.dockWidths[s.dockPane]);
  const setDockPane = useDockStore((s) => s.setDockPane);
  const setDockWidth = useDockStore((s) => s.setDockWidth);

  const containerRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  const { onMouseDown: handleResize } = useResizable({
    direction: "horizontal",
    min: DOCK_MIN,
    max: DOCK_MAX,
    currentValue: width,
    invert: true,
    onResize: (w) => setDockWidth(dockPane, w),
  });

  // Move focus into the dock whenever it transitions from closed to open —
  // matches a keyboard-triggered open (Ctrl+H, Ctrl+Shift+L, the Inspector
  // key), and is harmless on a mouse-triggered one.
  useEffect(() => {
    if (dockOpen && !wasOpenRef.current) {
      containerRef.current
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
    }
    wasOpenRef.current = dockOpen;
  }, [dockOpen, dockPane]);

  useEffect(() => {
    // Mirrors the render guard below: no dock on screen, no listener.
    if (!isConnected || !dockOpen) return;
    const handleKeyDown = createDockEscapeHandler(
      () => containerRef.current,
      () => useDockStore.getState().closeDock(),
    );
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConnected, dockOpen]);

  const queryResult = useQueryStore((s) => s.result);
  const inspectorStoreColumns = useInspectorStore((s) => s.columns);
  const inspectorStoreRow = useInspectorStore((s) => s.row);
  const selectedRowIndex = useLayoutStore((s) => s.selectedRowIndex);
  const { handleHistorySelect } = useTableCallbacks();

  const inspectorColumns = inspectorStoreRow ? inspectorStoreColumns : (queryResult?.columns ?? []);
  const selectedRow = inspectorStoreRow
    ?? (queryResult && selectedRowIndex !== null ? (queryResult.rows[selectedRowIndex] ?? null) : null);

  if (!isConnected || !dockOpen) return null;

  return (
    <>
      <div
        className="group w-1.5 cursor-col-resize bg-border-subtle hover:bg-accent-blue flex flex-col items-center justify-center"
        onMouseDown={handleResize}
        aria-hidden="true"
      >
        <SplitterGrip />
      </div>
      <div
        ref={containerRef}
        style={{ width }}
        className="z-dock flex flex-shrink-0 flex-col border-l border-border bg-surface shadow-panel"
      >
        <div className="flex h-control-sm items-center justify-between border-b border-border">
          <TabStrip
            tabs={[
              { id: "inspector", label: t("inspector.title") },
              { id: "history", label: t("dock.historyTab") },
              { id: "ai", label: t("aiChat.title") },
            ]}
            activeId={dockPane}
            onSelect={(id) => setDockPane(id as DockPane)}
            height="sm"
            aria-label={t("dock.tablist")}
          />
          <IconButton
            icon={<X size={14} aria-hidden="true" />}
            aria-label={t("dock.close")}
            title={t("dock.close")}
            onClick={() => useDockStore.getState().closeDock()}
            className="mr-1"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {dockPane === "inspector" && <InspectorPanel columns={inspectorColumns} row={selectedRow} />}
          {dockPane === "history" && <HistoryPanel onSelectQuery={handleHistorySelect} />}
          {dockPane === "ai" && (
            <Suspense fallback={<PanelLoader className="h-full" />}>
              <AiChatPanel />
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
}
