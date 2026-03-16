import { useEffect } from "react";
import { X } from "lucide-react";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  label: string;
  items: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Editor",
    items: [
      { keys: ["Ctrl", "Enter"], description: "Run query" },
      { keys: ["Ctrl", "Shift", "Enter"], description: "Run all" },
      { keys: ["Ctrl", "Shift", "F"], description: "Format SQL" },
      { keys: ["Ctrl", "/"], description: "Toggle comment" },
      { keys: ["Ctrl", "D"], description: "Select next occurrence" },
    ],
  },
  {
    label: "Tabs",
    items: [
      { keys: ["Ctrl", "N"], description: "New tab" },
      { keys: ["Ctrl", "W"], description: "Close tab" },
      { keys: ["Ctrl", "Tab"], description: "Next tab" },
      { keys: ["Ctrl", "Shift", "Tab"], description: "Previous tab" },
    ],
  },
  {
    label: "Data Grid",
    items: [
      { keys: ["Ctrl", "S"], description: "Save changes" },
      { keys: ["Ctrl", "I"], description: "Insert new row" },
      { keys: ["Ctrl", "Z"], description: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Redo" },
    ],
  },
  {
    label: "Navigation",
    items: [
      { keys: ["Ctrl", "K"], description: "Quick switcher" },
      { keys: ["Ctrl", "Shift", "E"], description: "Toggle sidebar" },
      { keys: ["Ctrl", "Shift", "I"], description: "Toggle inspector" },
      { keys: ["Ctrl", "H"], description: "Toggle history" },
    ],
  },
  {
    label: "General",
    items: [
      { keys: ["Ctrl", ","], description: "Settings" },
      { keys: ["Ctrl", "Shift", "M"], description: "Import SQL" },
      { keys: ["F5"], description: "Refresh schema" },
      { keys: ["F1"], description: "This help" },
      { keys: ["Escape"], description: "Cancel / dismiss" },
    ],
  },
];

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-[640px] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="grid grid-cols-2 gap-6 p-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                {group.label}
              </h3>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.description} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-neutral-300">{item.description}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className="rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-300"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="border-t border-neutral-800 px-6 py-3 text-xs text-neutral-600">
          Press <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 font-mono text-xs text-neutral-500">Esc</kbd> or click outside to close
        </div>
      </div>
    </div>
  );
}
