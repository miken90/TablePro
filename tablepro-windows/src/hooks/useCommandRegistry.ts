import { create } from 'zustand';

export type CommandCategory = 'Navigation' | 'Query' | 'Edit' | 'View' | 'Settings';

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
