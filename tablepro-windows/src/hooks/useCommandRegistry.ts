import { create } from 'zustand';

export type CommandCategory = 'Navigation' | 'Query' | 'Edit' | 'View' | 'Settings';

/**
 * Static definition of a command — single source of truth for ID, label,
 * default binding, and category. Runtime handlers register separately via
 * the CommandStore.
 */
export interface CommandDefinition {
  /** Stable namespaced ID, e.g. "editor.run" */
  id: string;
  /** Human-readable label shown in help & command palette */
  label: string;
  /** Default key binding as display strings, e.g. ["Ctrl", "Enter"] */
  defaultBinding: string[];
  /** Category for grouping in help and command palette */
  category: CommandCategory;
}

// ---------------------------------------------------------------------------
// Static command definitions — THE source of truth for shortcuts.
// ShortcutsHelp, CommandPalette, and keyboard hooks all derive from this.
// ---------------------------------------------------------------------------

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  // -- Editor --
  { id: "editor.run",           label: "Run Query",            defaultBinding: ["Ctrl", "Enter"],       category: "Query" },
  { id: "editor.cancel",        label: "Cancel Query",         defaultBinding: ["Escape"],              category: "Query" },
  { id: "editor.formatSql",     label: "Format SQL",           defaultBinding: ["Ctrl", "Shift", "F"],  category: "Query" },
  { id: "editor.toggleComment", label: "Toggle Comment",       defaultBinding: ["Ctrl", "/"],           category: "Query" },

  // -- Tabs --
  { id: "tabs.new",             label: "New Tab",              defaultBinding: ["Ctrl", "T"],           category: "Edit" },
  { id: "tabs.close",           label: "Close Tab",            defaultBinding: ["Ctrl", "W"],           category: "Edit" },
  { id: "tabs.next",            label: "Next Tab",             defaultBinding: ["Ctrl", "Tab"],         category: "Edit" },
  { id: "tabs.prev",            label: "Previous Tab",         defaultBinding: ["Ctrl", "Shift", "Tab"],category: "Edit" },

  // -- Data Grid --
  { id: "data.save",            label: "Save Changes",         defaultBinding: ["Ctrl", "S"],           category: "Edit" },
  { id: "data.insertRow",       label: "Insert Row",           defaultBinding: ["Ctrl", "I"],           category: "Edit" },
  { id: "data.importSql",       label: "Import SQL",           defaultBinding: ["Ctrl", "Shift", "M"],  category: "Edit" },

  // -- Navigation --
  { id: "nav.quickSwitcher",    label: "Quick Switcher",       defaultBinding: ["Ctrl", "K"],           category: "Navigation" },
  { id: "nav.toggleSidebar",    label: "Toggle Sidebar",       defaultBinding: ["Ctrl", "Shift", "E"],  category: "Navigation" },
  { id: "nav.toggleAiChat",     label: "Toggle AI Chat",       defaultBinding: ["Ctrl", "Shift", "L"],  category: "Navigation" },
  { id: "nav.toggleInspector",  label: "Toggle Inspector",     defaultBinding: ["Ctrl", "Shift", "I"],  category: "Navigation" },
  { id: "nav.toggleHistory",    label: "Toggle History",       defaultBinding: ["Ctrl", "H"],           category: "Navigation" },
  { id: "nav.commandPalette",   label: "Command Palette",      defaultBinding: ["Ctrl", "Shift", "P"],  category: "Navigation" },

  // -- General --
  { id: "app.settings",         label: "Settings",             defaultBinding: ["Ctrl", ","],           category: "Settings" },
  { id: "app.refreshSchema",    label: "Refresh Schema",       defaultBinding: ["F5"],                  category: "Settings" },
  { id: "app.help",             label: "Keyboard Shortcuts",   defaultBinding: ["F1"],                  category: "Settings" },
];

/**
 * Group definitions by category, preserving array order within each group.
 */
export function getCommandsByCategory(): Record<CommandCategory, CommandDefinition[]> {
  const groups: Record<CommandCategory, CommandDefinition[]> = {
    Navigation: [],
    Query: [],
    Edit: [],
    View: [],
    Settings: [],
  };
  for (const def of COMMAND_DEFINITIONS) {
    groups[def.category].push(def);
  }
  return groups;
}

/**
 * Look up the default binding for a command by ID.
 * Returns undefined if the command ID is not found.
 */
export function getDefaultBinding(id: string): string[] | undefined {
  return COMMAND_DEFINITIONS.find((d) => d.id === id)?.defaultBinding;
}

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: CommandCategory;
  action: () => void;
  when?: () => boolean;
}

interface CommandStore {
  commands: Command[];
  recentCommandIds: string[];
  registerCommand: (cmd: Command) => void;
  unregisterCommand: (id: string) => void;
  executeCommand: (id: string) => void;
  getFilteredCommands: (query: string) => Command[];
  getRecentCommands: () => Command[];
}

export const useCommandStore = create<CommandStore>((set, get) => ({
  commands: [],
  recentCommandIds: [],

  registerCommand: (cmd) =>
    set((s) => {
      // Replace if already registered (idempotent)
      const existing = s.commands.findIndex((c) => c.id === cmd.id);
      if (existing >= 0) {
        const updated = [...s.commands];
        updated[existing] = cmd;
        return { commands: updated };
      }
      return { commands: [...s.commands, cmd] };
    }),

  unregisterCommand: (id) =>
    set((s) => ({ commands: s.commands.filter((c) => c.id !== id) })),

  executeCommand: (id) => {
    const cmd = get().commands.find((c) => c.id === id);
    if (cmd && (!cmd.when || cmd.when())) {
      cmd.action();
      set((s) => ({
        recentCommandIds: [id, ...s.recentCommandIds.filter((i) => i !== id)].slice(0, 5),
      }));
    }
  },

  getFilteredCommands: (query) => {
    const q = query.toLowerCase().trim();
    const cmds = get().commands.filter((c) => !c.when || c.when());
    if (!q) return cmds;
    return cmds.filter(
      (c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  },

  getRecentCommands: () => {
    const { commands, recentCommandIds } = get();
    return recentCommandIds
      .map((id) => commands.find((c) => c.id === id))
      .filter((c): c is Command => c != null && (!c.when || c.when()));
  },
}));
