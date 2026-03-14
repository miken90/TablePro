import { Plus, X } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";

export function EditorTabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  return (
    <div className="flex h-8 items-center border-b border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="flex flex-1 items-center overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex min-w-0 max-w-[160px] cursor-pointer items-center gap-1.5 border-r border-zinc-200 px-3 py-1 text-xs dark:border-zinc-700 ${
              tab.id === activeTabId
                ? "bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            <span className="truncate">
              {tab.isDirty && <span className="mr-0.5 text-blue-500">•</span>}
              {tab.title}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* New tab button */}
      <button
        onClick={() => addTab()}
        className="flex h-full items-center px-2 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700"
        title="New tab"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
