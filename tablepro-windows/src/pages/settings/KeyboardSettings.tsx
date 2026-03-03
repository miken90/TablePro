import { useSettingsStore } from "../../stores/settings";

export function KeyboardSettings() {
  const { settings, updateSection } = useSettingsStore();
  if (!settings) return null;
  const keyboard = settings.keyboard;

  const update = (patch: Partial<typeof keyboard>) => {
    updateSection("keyboard", { ...keyboard, ...patch });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Keyboard</h3>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-zinc-700 dark:text-zinc-300">Vim Mode</span>
          <p className="text-xs text-zinc-500">
            Enable Vim keybindings in the SQL editor
          </p>
        </div>
        <button
          onClick={() => update({ vimMode: !keyboard.vimMode })}
          className={`relative h-5 w-9 rounded-full transition ${keyboard.vimMode ? "bg-blue-600" : "bg-zinc-600"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${keyboard.vimMode ? "left-4" : "left-0.5"}`}
          />
        </button>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
        <h4 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Default Shortcuts
        </h4>
        <div className="space-y-2 text-sm">
          <ShortcutRow action="Execute Query" shortcut="Ctrl+Enter" />
          <ShortcutRow action="New Tab" shortcut="Ctrl+T" />
          <ShortcutRow action="Close Tab" shortcut="Ctrl+W" />
          <ShortcutRow action="Save" shortcut="Ctrl+S" />
          <ShortcutRow action="Find" shortcut="Ctrl+F" />
          <ShortcutRow action="Format SQL" shortcut="Ctrl+Shift+F" />
          <ShortcutRow action="Toggle Sidebar" shortcut="Ctrl+B" />
          <ShortcutRow action="Settings" shortcut="Ctrl+," />
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  action,
  shortcut,
}: {
  action: string;
  shortcut: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500 dark:text-zinc-400">{action}</span>
      <kbd className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
        {shortcut}
      </kbd>
    </div>
  );
}
