import { X } from "lucide-react";
import type { EditorTab as EditorTabType } from "../../stores/editorStore";
import { TabIcon } from "./TabIcon";

interface EditorTabProps {
  tab: EditorTabType;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  connectionColor?: string;
}

export function EditorTab({
  tab,
  isActive,
  onClick,
  onClose,
  onDoubleClick,
  connectionColor,
}: EditorTabProps) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        "group relative flex min-w-0 max-w-[160px] cursor-pointer items-center gap-1.5",
        "border-r border-zinc-200 px-3 py-1 text-xs dark:border-zinc-700",
        isActive
          ? "bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700",
        tab.isPreview ? "opacity-70" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <TabIcon type={tab.type ?? 'query'} />

      <span
        className={[
          "truncate max-w-[120px]",
          tab.isPreview ? "italic" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {tab.isDirty && <span className="mr-0.5 text-blue-500">•</span>}
        {tab.title}
      </span>

      {!(tab.isPinned ?? false) && (
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
          title="Close tab"
          aria-label="Close tab"
        >
          <X size={10} />
        </button>
      )}

      {/* Connection color indicator */}
      {connectionColor && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: connectionColor }}
        />
      )}
    </div>
  );
}
