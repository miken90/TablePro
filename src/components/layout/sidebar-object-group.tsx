import { useState } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";

interface SidebarObjectGroupProps {
  label: string;
  icon: LucideIcon;
  count: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function SidebarObjectGroup({
  label,
  icon: Icon,
  count,
  defaultExpanded = false,
  children,
}: SidebarObjectGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={12} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-text-muted" />
        )}
        <Icon size={12} className="shrink-0 text-text-muted" />
        <span className="font-medium">{label}</span>
        <span className="text-text-muted">({count})</span>
      </button>
      {expanded && children}
    </div>
  );
}
