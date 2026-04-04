import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import {
  COMMAND_DEFINITIONS,
  type CommandCategory,
  type CommandDefinition,
  useShortcutStore,
  findBindingConflict,
  bindingToKey,
} from "../../hooks/useCommandRegistry";

const DISPLAY_SECTIONS: { category: CommandCategory; label: string }[] = [
  { category: "Query", label: "Editor" },
  { category: "Edit", label: "Tabs & Data" },
  { category: "Navigation", label: "Navigation" },
  { category: "Settings", label: "General" },
];

/**
 * Convert a KeyboardEvent into display-string parts, e.g. ["Ctrl", "Shift", "K"].
 */
function eventToDisplayBinding(e: KeyboardEvent): string[] {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  const key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return parts;

  // Normalize display name
  if (key === ' ') parts.push("Space");
  else if (key === 'Escape') parts.push("Escape");
  else if (key === 'Enter') parts.push("Enter");
  else if (key === 'Tab') parts.push("Tab");
  else if (key === 'Backspace') parts.push("Backspace");
  else if (key === 'Delete') parts.push("Delete");
  else if (key === 'ArrowUp') parts.push("Up");
  else if (key === 'ArrowDown') parts.push("Down");
  else if (key === 'ArrowLeft') parts.push("Left");
  else if (key === 'ArrowRight') parts.push("Right");
  else if (key.startsWith('F') && key.length >= 2 && key.length <= 3 && !isNaN(Number(key.slice(1))))
    parts.push(key); // F1-F12
  else if (key === ',') parts.push(",");
  else if (key === '/') parts.push("/");
  else parts.push(key.length === 1 ? key.toUpperCase() : key);

  return parts;
}

interface KeyCaptureProps {
  commandId: string;
  commandLabel: string;
  onSave: (binding: string[]) => void;
  onCancel: () => void;
}

function KeyCaptureOverlay({ commandId, commandLabel, onSave, onCancel }: KeyCaptureProps) {
  const [captured, setCaptured] = useState<string[] | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const userBindings = useShortcutStore((s) => s.userBindings);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        onCancel();
        return;
      }

      // Wait for a non-modifier key
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      const binding = eventToDisplayBinding(e);
      if (binding.length === 0) return;

      setCaptured(binding);

      // Check for conflicts
      const conflictId = findBindingConflict(commandId, binding, userBindings);
      if (conflictId) {
        const conflictDef = COMMAND_DEFINITIONS.find((d) => d.id === conflictId);
        setConflict(conflictDef?.label ?? conflictId);
      } else {
        setConflict(null);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [commandId, userBindings, onCancel]);

  const handleSave = () => {
    if (captured) onSave(captured);
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-[380px] rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          Set shortcut for &ldquo;{commandLabel}&rdquo;
        </h4>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          Press the desired key combination, then click Save.
        </p>

        {/* Captured binding display */}
        <div className="mt-4 flex min-h-[40px] items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800">
          {captured ? (
            <span className="flex items-center gap-1">
              {captured.map((key, i) => (
                <kbd
                  key={i}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
                >
                  {key}
                </kbd>
              ))}
            </span>
          ) : (
            <span className="text-xs text-zinc-400">Waiting for keypress...</span>
          )}
        </div>

        {/* Conflict warning */}
        {conflict && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Conflicts with &ldquo;{conflict}&rdquo;. Saving will override that binding.
          </p>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!captured}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {conflict ? "Save Anyway" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ item }: { item: CommandDefinition }) {
  const [capturing, setCapturing] = useState(false);
  const userBindings = useShortcutStore((s) => s.userBindings);
  const setBinding = useShortcutStore((s) => s.setBinding);
  const resetBinding = useShortcutStore((s) => s.resetBinding);

  const effectiveBinding = userBindings[item.id] ?? item.defaultBinding;
  const isCustom = item.id in userBindings;

  const handleSave = useCallback(
    (binding: string[]) => {
      // If the proposed binding matches the default, remove override
      if (bindingToKey(binding) === bindingToKey(item.defaultBinding)) {
        resetBinding(item.id);
      } else {
        // If this binding conflicts, also remove the conflicting override
        const conflictId = findBindingConflict(item.id, binding, userBindings);
        if (conflictId && conflictId in userBindings) {
          // Swap: the conflicting command gets our old binding
          useShortcutStore.getState().setBinding(conflictId, effectiveBinding);
        }
        setBinding(item.id, binding);
      }
      setCapturing(false);
    },
    [item.id, item.defaultBinding, userBindings, effectiveBinding, setBinding, resetBinding],
  );

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-zinc-700 dark:text-zinc-300">
          {item.label}
        </span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => setCapturing(true)}
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Click to change shortcut"
          >
            {effectiveBinding.map((key, i) => (
              <kbd
                key={i}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                  isCustom
                    ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                    : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {key}
              </kbd>
            ))}
          </button>
          {isCustom && (
            <button
              onClick={() => resetBinding(item.id)}
              className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              title="Reset to default"
            >
              <RotateCcw size={11} />
            </button>
          )}
        </span>
      </div>
      {capturing && (
        <KeyCaptureOverlay
          commandId={item.id}
          commandLabel={item.label}
          onSave={handleSave}
          onCancel={() => setCapturing(false)}
        />
      )}
    </>
  );
}

export function SettingsShortcuts() {
  const resetAllBindings = useShortcutStore((s) => s.resetAllBindings);
  const userBindings = useShortcutStore((s) => s.userBindings);
  const hasCustomBindings = Object.keys(userBindings).length > 0;

  const groups = useMemo(() => {
    return DISPLAY_SECTIONS.map((section) => ({
      label: section.label,
      items: COMMAND_DEFINITIONS.filter((d) => d.category === section.category),
    })).filter((g) => g.items.length > 0);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            Keyboard Shortcuts
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Click on a shortcut to customize it. Custom bindings are highlighted in blue.
          </p>
        </div>
        {hasCustomBindings && (
          <button
            onClick={resetAllBindings}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <RotateCcw size={11} />
            Reset All
          </button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.label}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {group.label}
          </h4>
          <div className="rounded border border-zinc-200 dark:border-zinc-700">
            {group.items.map((item, idx) => (
              <div
                key={item.id}
                className={idx > 0 ? "border-t border-zinc-200 dark:border-zinc-700" : ""}
              >
                <ShortcutRow item={item} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
