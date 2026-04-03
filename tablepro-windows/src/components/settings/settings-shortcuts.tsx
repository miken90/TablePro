import { useMemo } from "react";
import {
  COMMAND_DEFINITIONS,
  type CommandCategory,
} from "../../hooks/useCommandRegistry";

const DISPLAY_SECTIONS: { category: CommandCategory; label: string }[] = [
  { category: "Query", label: "Editor" },
  { category: "Edit", label: "Tabs & Data" },
  { category: "Navigation", label: "Navigation" },
  { category: "Settings", label: "General" },
];

export function SettingsShortcuts() {
  const groups = useMemo(() => {
    return DISPLAY_SECTIONS.map((section) => ({
      label: section.label,
      items: COMMAND_DEFINITIONS.filter((d) => d.category === section.category),
    })).filter((g) => g.items.length > 0);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          Keyboard Shortcuts
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Shortcut customization will be available in a future update. These are the current defaults.
        </p>
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
                className={`flex items-center justify-between px-3 py-2 ${
                  idx > 0 ? "border-t border-zinc-200 dark:border-zinc-700" : ""
                }`}
              >
                <span className="text-xs text-zinc-700 dark:text-zinc-300">
                  {item.label}
                </span>
                <span className="flex items-center gap-1">
                  {item.defaultBinding.map((key, i) => (
                    <kbd
                      key={i}
                      className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {key}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
