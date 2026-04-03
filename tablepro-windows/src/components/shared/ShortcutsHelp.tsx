import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import {
  COMMAND_DEFINITIONS,
  type CommandCategory,
} from "../../hooks/useCommandRegistry";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

// Display order and labels for help groups.
// Categories are mapped from CommandCategory to user-friendly labels.
const HELP_SECTIONS: { category: CommandCategory; label: string }[] = [
  { category: "Query", label: "Editor" },
  { category: "Edit", label: "Tabs & Data" },
  { category: "Navigation", label: "Navigation" },
  { category: "Settings", label: "General" },
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

  const groups = useMemo(() => {
    return HELP_SECTIONS.map((section) => ({
      label: section.label,
      items: COMMAND_DEFINITIONS
        .filter((def) => def.category === section.category)
        .map((def) => ({ keys: def.defaultBinding, description: def.label })),
    })).filter((g) => g.items.length > 0);
  }, []);

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
          {groups.map((group) => (
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
