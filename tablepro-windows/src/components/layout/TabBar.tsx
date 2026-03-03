import { useTabStore } from "../../stores/tabs";
import { X, Plus } from "lucide-react";

interface TabBarProps {
  onNewTab: () => void;
}

export function TabBar({ onNewTab }: TabBarProps) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);

  return (
    <div className="flex h-9 items-center border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-1 items-center gap-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group flex h-9 items-center gap-1.5 border-r border-zinc-200 px-3 text-xs transition dark:border-zinc-700 ${
              activeTabId === tab.id
                ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-850 dark:hover:text-zinc-300"
            }`}
          >
            <span className="max-w-[120px] truncate">{tab.title}</span>
            {tab.isDirty && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 rounded p-0.5 opacity-0 transition hover:bg-zinc-200 group-hover:opacity-100 dark:hover:bg-zinc-600"
            >
              <X size={12} />
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={onNewTab}
        className="flex h-9 w-9 items-center justify-center text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
