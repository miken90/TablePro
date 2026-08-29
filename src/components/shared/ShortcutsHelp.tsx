import { useMemo } from "react";
import {
  COMMAND_DEFINITIONS,
  type CommandCategory,
  useShortcutStore,
} from "../../hooks/useCommandRegistry";
import { Dialog, Kbd } from "../ui";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

// Display order and labels for help groups.
const HELP_SECTIONS: { category: CommandCategory; label: string }[] = [
  { category: "Query", label: "Editor" },
  { category: "Edit", label: "Tabs & Data" },
  { category: "Navigation", label: "Navigation" },
  { category: "Settings", label: "General" },
];

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const userBindings = useShortcutStore((s) => s.userBindings);

  const groups = useMemo(() => {
    return HELP_SECTIONS.map((section) => ({
      label: section.label,
      items: COMMAND_DEFINITIONS
        .filter((def) => def.category === section.category)
        .map((def) => ({
          keys: userBindings[def.id] ?? def.defaultBinding,
          description: def.label,
          isCustom: def.id in userBindings,
        })),
    })).filter((g) => g.items.length > 0);
  }, [userBindings]);

  return (
    <Dialog open={open} onClose={onClose} title="Keyboard Shortcuts" size="lg" cancelLabel="Close">
      <div className="grid grid-cols-2 gap-6">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-3 text-ui-2xs font-semibold uppercase tracking-wider text-text-secondary">
              {group.label}
            </h3>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.description} className="flex items-center justify-between gap-4">
                  <span className="text-ui-sm text-text-primary">{item.description}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key, i) => (
                      <Kbd key={i} className={item.isCustom ? "border-accent-blue text-accent-blue" : undefined}>
                        {key}
                      </Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
