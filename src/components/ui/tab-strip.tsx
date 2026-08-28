import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabStripItem {
  id: string;
  label: ReactNode;
  /** Renders a 6px dot in place of the close control until hover. */
  dirty?: boolean;
  onClose?: () => void;
}

export interface TabStripProps {
  tabs: TabStripItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** `--h-tabbar` for the workspace strip (SCR-06); `--control-h-sm` for nested strips (SCR-16/28/54, the dock). */
  height?: "tabbar" | "sm";
  "aria-label": string;
  className?: string;
}

/**
 * One implementation, parameterised by height, for SCR-06/16/28/54 and the
 * dock (design-spec 5.16). `role="tablist"` with roving tabindex: arrow
 * keys move both focus and selection between tabs.
 */
export function TabStrip({
  tabs,
  activeId,
  onSelect,
  height = "tabbar",
  "aria-label": ariaLabel,
  className,
}: TabStripProps) {
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === activeId);
    if (index === -1) return;

    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    e.preventDefault();
    const next = tabs[nextIndex];
    onSelect(next.id);
    buttonRefs.current.get(next.id)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={[
        "flex items-stretch",
        height === "tabbar" ? "h-tabbar" : "h-control-sm",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(tab.id, el);
              else buttonRefs.current.delete(tab.id);
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            className={[
              "group flex items-center gap-sm border-b-2 px-lg text-ui-sm transition-colors duration-fast ease-snappy hover:bg-surface-hover",
              active ? "border-accent-blue text-text-primary" : "border-transparent text-text-secondary",
            ].join(" ")}
          >
            {tab.label}
            {tab.onClose && (
              <>
                {tab.dirty && (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-accent-yellow group-hover:hidden"
                  />
                )}
                <span
                  role="button"
                  aria-label="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    tab.onClose?.();
                  }}
                  className={tab.dirty ? "hidden group-hover:inline-flex" : "inline-flex"}
                >
                  ×
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
