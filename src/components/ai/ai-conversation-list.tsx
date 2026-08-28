import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Conversation } from "../../stores/aiChatStore";

interface AiConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function AiConversationList({
  conversations,
  activeConversationId,
  onSwitch,
  onNew,
  onDelete,
}: AiConversationListProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeTitle =
    conversations.find((c) => c.id === activeConversationId)?.title ?? "New Chat";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-primary hover:bg-surface-muted"
        title="Switch conversation"
        aria-label="Switch AI conversation"
      >
        <span className="max-w-[160px] truncate">{activeTitle}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-surface shadow-lg">
          <div className="border-b border-border-subtle p-1">
            <button
              onClick={() => {
                onNew();
                setOpen(false);
              }}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
            >
              <Plus size={12} aria-hidden="true" />
              New Conversation
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-secondary">No conversations yet</p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-surface-muted hover:text-text-primary ${
                    c.id === activeConversationId ? "bg-surface-hover text-text-primary" : "text-text-secondary"
                  }`}
                  onClick={() => {
                    onSwitch(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="truncate flex-1">{c.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                    className="hidden rounded p-0.5 text-text-muted hover:text-accent-red group-hover:block"
                    title="Delete conversation"
                    aria-label={`Delete conversation: ${c.title}`}
                  >
                    <Trash2 size={10} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
