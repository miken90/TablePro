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

export function TabIcon({ type }: TabIconProps) {
  const Icon = icons[type] ?? Code;
  return <Icon size={14} className="shrink-0 text-zinc-400 dark:text-zinc-500" />;
}
