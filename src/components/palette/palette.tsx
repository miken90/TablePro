import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import { Search, X, Database, Table2, Layers, Clock, Terminal } from "lucide-react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useHistoryStore } from "../../stores/history";
import { useLayoutStore } from "../../stores/layoutStore";
import {
  useCommandStore,
  useShortcutStore,
  getDefaultBinding,
  useEffectiveBinding,
  type Command,
  type CommandCategory,
} from "../../hooks/useCommandRegistry";
import { Field, Kbd, useFocusTrap } from "../ui";
import { PaletteRow } from "./palette-row";
import {
  parsePaletteInput,
  buildObjectResults,
  KIND_LABELS,
  type ResultKind,
} from "./palette-modes";

interface PaletteProps {
  onSelectTable: (tableName: string, schema?: string | null) => void;
}

const CATEGORY_ORDER: CommandCategory[] = ["Navigation", "Query", "Edit", "View", "Settings"];

interface FlatRow {
  id: string;
  icon: ReactNode;
  label: ReactNode;
  subtitle?: string;
  groupTag: string;
  shortcut?: string[];
  onSelect: () => void;
}

interface Section {
  key: string;
  label: string;
  icon: ReactNode;
  rows: FlatRow[];
}

function kindIcon(kind: ResultKind): ReactNode {
  const size = 12;
  switch (kind) {
    case "table": return <Table2 size={size} />;
    case "view": return <Layers size={size} />;
    case "collection": return <Database size={size} />;
    case "database": return <Database size={size} />;
    case "schema": return <Layers size={size} />;
    case "query": return <Clock size={size} />;
  }
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-accent-yellow/40 text-text-primary">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * M5 — SCR-52 (Quick Switcher) and SCR-53 (Command Palette) merged into one
 * overlay with two modes (Q1). A bare query searches objects; a leading `>`
 * (shown as a removable chip) switches to commands. Modal per design-spec
 * 5.16's "Is the palette modal?" ruling: `role="dialog" aria-modal="true"`,
 * full keyboard capture, but **no scrim** — that is a visual choice, not a
 * modality one.
 */
export function Palette({ onSelectTable }: PaletteProps) {
  const paletteOpen = useLayoutStore((s) => s.paletteOpen);
  const paletteSeedMode = useLayoutStore((s) => s.paletteSeedMode);

  const [chipActive, setChipActive] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, {
    active: paletteOpen,
    onEscape: () => useLayoutStore.getState().closePalette(),
    initialFocusRef: inputRef,
  });

  // [RT-12] Seed on the false→true edge (or a mode switch while already
  // open), never merely because the seed value repeats an earlier open.
  useEffect(() => {
    if (!paletteOpen) return;
    setChipActive(paletteSeedMode === "commands");
    setQuery("");
    setCursor(0);
    void useHistoryStore.getState().fetchRecent();
  }, [paletteOpen, paletteSeedMode]);

  useEffect(() => {
    setCursor(0);
  }, [query, chipActive]);

  // Object mode data
  const tables = useSchemaStore((s) => s.tables);
  const schemas = useSchemaStore((s) => s.schemas);
  const databases = useSchemaStore((s) => s.databases);
  const currentSchema = useSchemaStore((s) => s.currentSchema);
  const setCurrentSchema = useSchemaStore((s) => s.setCurrentSchema);
  const capabilities = useSchemaStore((s) => s.capabilities);
  const isDocumentDb = capabilities.supportsCollections && !capabilities.supportsSqlEditor;
  const historyEntries = useHistoryStore((s) => s.entries);

  // Command mode data — subscribing to the whole map, and feeding it into
  // the `sections` useMemo below, so every row's Kbd (via `getEffectiveBinding`)
  // recomputes on a rebind in SCR-62, not just on first mount. [RT-14]
  const userBindings = useShortcutStore((s) => s.userBindings);
  const { getFilteredCommands, getRecentCommands, executeCommand } = useCommandStore();

  const objectGroups = useMemo(
    () => buildObjectResults({ tables, databases, schemas, historyEntries, isDocumentDb, currentSchema, query }),
    [tables, databases, schemas, historyEntries, isDocumentDb, currentSchema, query],
  );

  const filteredCommands = useMemo(() => getFilteredCommands(query), [getFilteredCommands, query]);
  const recentCommands = useMemo(
    () => (query === "" ? getRecentCommands() : []),
    [query, getRecentCommands],
  );

  const closePalette = useCallback(() => useLayoutStore.getState().closePalette(), []);

  const selectObject = useCallback(
    (item: (typeof objectGroups)[number]["items"][number]) => {
      switch (item.kind) {
        case "table":
        case "view":
        case "collection":
          onSelectTable(item.label, item.schema);
          closePalette();
          break;
        case "database":
          // No sessionId available here to switch database directly —
          // close and let the sidebar drive it, same as before the merge.
          closePalette();
          break;
        case "schema":
          setCurrentSchema(item.label === currentSchema ? null : item.label);
          closePalette();
          break;
        case "query":
          if (item.historyEntry) {
            window.dispatchEvent(
              new CustomEvent("tablepro:open-query-from-history", {
                detail: { query: item.historyEntry.query },
              }),
            );
          }
          closePalette();
          break;
      }
    },
    [onSelectTable, closePalette, setCurrentSchema, currentSchema],
  );

  const sections: Section[] = useMemo(() => {
    if (chipActive) {
      const out: Section[] = [];
      if (recentCommands.length > 0) {
        out.push({
          key: "Recent",
          label: "Recent",
          icon: null,
          rows: recentCommands.map((cmd) => commandRow(cmd)),
        });
      }
      for (const cat of CATEGORY_ORDER) {
        const cmds = filteredCommands.filter((c) => c.category === cat);
        if (cmds.length === 0) continue;
        out.push({ key: cat, label: cat, icon: null, rows: cmds.map((cmd) => commandRow(cmd)) });
      }
      return out;

      function commandRow(cmd: Command): FlatRow {
        return {
          id: cmd.id,
          icon: <Terminal size={12} />,
          label: cmd.label,
          groupTag: cmd.category,
          shortcut: userBindings[cmd.id] ?? getDefaultBinding(cmd.id),
          onSelect: () => {
            executeCommand(cmd.id);
            closePalette();
          },
        };
      }
    }

    return objectGroups.map((g) => ({
      key: g.kind,
      label: g.label,
      icon: kindIcon(g.kind),
      rows: g.items.map((item) => ({
        id: item.id,
        icon: kindIcon(item.kind),
        label: highlightMatch(item.label, query),
        subtitle: item.subtitle,
        groupTag: KIND_LABELS[item.kind],
        onSelect: () => selectObject(item),
      })),
    }));
  }, [chipActive, recentCommands, filteredCommands, objectGroups, query, executeCommand, closePalette, selectObject, userBindings]);

  const flatRows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const totalCount = flatRows.length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !e.nativeEvent.isComposing && chipActive && query === "") {
      e.preventDefault();
      setChipActive(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flatRows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flatRows[cursor]?.onSelect();
    }
  };

  const handleInputChange = (raw: string) => {
    if (!chipActive) {
      const parsed = parsePaletteInput(raw);
      if (parsed.mode === "commands") {
        setChipActive(true);
        setQuery(parsed.query);
        return;
      }
    }
    setQuery(raw);
  };

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const modeShortcut = useEffectiveBinding(chipActive ? "nav.commandPalette" : "nav.quickSwitcher");

  if (!paletteOpen) return null;

  const placeholder = chipActive
    ? "Type a command…"
    : isDocumentDb
      ? "Search collections, databases, queries…"
      : "Search tables, schemas, databases, queries…";

  let flatOffset = 0;

  return (
    <div
      className="fixed inset-0 z-popover flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={chipActive ? "Command Palette" : "Quick Switcher"}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-modal"
      >
        <Field className="m-sm">
          <Search size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
          {chipActive && (
            <span className="flex shrink-0 items-center gap-2xs rounded-xs bg-surface-muted px-xs text-ui-2xs text-text-secondary">
              &gt;
              <button
                type="button"
                onClick={() => setChipActive(false)}
                aria-label="Switch to object search"
                className="hover:text-text-primary"
              >
                <X size={10} aria-hidden="true" />
              </button>
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={flatRows.length > 0}
            aria-controls="palette-listbox"
            aria-activedescendant={flatRows[cursor]?.id}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-ui-sm text-text-primary placeholder:text-text-secondary"
          />
        </Field>

        <div
          ref={listRef}
          id="palette-listbox"
          role="listbox"
          aria-label={chipActive ? "Commands" : "Objects"}
          className="max-h-[360px] overflow-y-auto py-xs"
        >
          {totalCount === 0 ? (
            <div className="px-lg py-2xl text-center text-ui-sm text-text-secondary">
              {query ? "No matches" : "No items available"}
            </div>
          ) : (
            sections.map((section) => {
              const groupStart = flatOffset;
              flatOffset += section.rows.length;
              return (
                <div key={section.key}>
                  <div className="flex items-center gap-xs px-lg pb-2xs pt-sm text-ui-2xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {section.icon}
                    {section.label}
                    <span className="ml-auto font-normal tabular-nums">{section.rows.length}</span>
                  </div>
                  {section.rows.map((row, i) => {
                    const flatIdx = groupStart + i;
                    return (
                      <div key={row.id} data-idx={flatIdx}>
                        <PaletteRow
                          id={row.id}
                          icon={row.icon}
                          label={row.label}
                          subtitle={row.subtitle}
                          groupTag={row.groupTag}
                          shortcut={row.shortcut}
                          active={cursor === flatIdx}
                          onClick={row.onSelect}
                          onMouseEnter={() => setCursor(flatIdx)}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-md border-t border-border-subtle px-lg py-sm text-ui-2xs text-text-secondary">
          <span className="flex items-center gap-2xs">
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-2xs">
            <Kbd>↵</Kbd> {chipActive ? "run" : "open"}
          </span>
          <span className="flex items-center gap-2xs">
            <Kbd>Esc</Kbd> close
          </span>
          <span className="ml-auto">
            {totalCount} result{totalCount !== 1 ? "s" : ""}
          </span>
          {modeShortcut && <Kbd>{modeShortcut.join("+")}</Kbd>}
        </div>
      </div>
    </div>
  );
}
