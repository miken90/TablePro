import type { ReactNode } from "react";
import { Kbd } from "../ui";

export interface PaletteRowProps {
  id: string;
  icon: ReactNode;
  label: ReactNode;
  /** e.g. the table's schema, or the query's database */
  subtitle?: string;
  /** Dimmed per-row group tag (Fey pattern) — the kind or category this row belongs to. */
  groupTag: string;
  /** Right-edge shortcut chip (Fey pattern) — commands mode rows only. */
  shortcut?: string[];
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

export function PaletteRow({
  id,
  icon,
  label,
  subtitle,
  groupTag,
  shortcut,
  active,
  onClick,
  onMouseEnter,
}: PaletteRowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={[
        "flex cursor-pointer items-center gap-sm px-lg py-sm text-ui-sm",
        active ? "bg-accent-blue text-white" : "text-text-primary hover:bg-surface-hover",
      ].join(" ")}
    >
      <span className="flex-shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {subtitle && (
        <span className={["shrink-0 text-ui-2xs", active ? "text-white/80" : "text-text-secondary"].join(" ")}>
          {subtitle}
        </span>
      )}
      <span
        className={[
          "shrink-0 rounded-xs px-xs text-ui-2xs uppercase tracking-wider",
          active ? "text-white/70" : "text-text-tertiary",
        ].join(" ")}
      >
        {groupTag}
      </span>
      {shortcut && (
        <Kbd className={active ? "border-white/40 text-white/90" : ""}>{shortcut.join("+")}</Kbd>
      )}
    </div>
  );
}
