import { X } from "lucide-react";
import { DEFAULT_SHORTCUTS } from "../../hooks/useKeyboardShortcuts";

interface ShortcutReferenceDialogProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = ["Editor", "Navigation", "Data Grid", "General"] as const;

export function ShortcutReferenceDialog({ open, onClose }: ShortcutReferenceDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-h-[80vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {CATEGORIES.map((category) => {
            const shortcuts = DEFAULT_SHORTCUTS.filter(
              (s) => s.category === category,
            );
            if (shortcuts.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {category}
                </h3>
                <div className="space-y-1">
                  {shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.action}
                      className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span className="text-zinc-700 dark:text-zinc-300">{shortcut.label}</span>
                      <kbd className="rounded bg-zinc-100 border border-zinc-200 px-2 py-0.5 text-xs font-mono text-zinc-500 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400">
                        {shortcut.display}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
