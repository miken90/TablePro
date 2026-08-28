import { Boxes, Code, Database, Table2, Terminal } from "lucide-react";
import type { TabType } from "../../stores/editorStore";

const icons: Record<TabType, React.ElementType> = {
  query: Code,
  table: Table2,
  structure: Boxes,
  mongoQuery: Database,
  redisCommand: Terminal,
};

interface TabIconProps {
  type: TabType;
}

/** Tab-kind glyph. Decorative: the tab's label carries the name. */
export function TabIcon({ type }: TabIconProps) {
  const Icon = icons[type] ?? Code;
  return <Icon size={14} aria-hidden="true" className="shrink-0 text-text-secondary" />;
}
