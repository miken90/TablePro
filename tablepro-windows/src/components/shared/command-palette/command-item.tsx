import { Command } from 'cmdk';
import type { Command as AppCommand } from '../../../hooks/useCommandRegistry';

interface CommandItemProps {
  command: AppCommand;
  onSelect: () => void;
}

export function CommandItem({ command, onSelect }: CommandItemProps) {
  return (
    <Command.Item
      value={`${command.id} ${command.label}`}
      onSelect={onSelect}
      className="group flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm
        text-[var(--color-text-primary)] outline-none
        aria-selected:bg-[var(--color-accent-blue)] aria-selected:text-white
        data-[selected=true]:bg-[var(--color-accent-blue)] data-[selected=true]:text-white"
    >
      <span className="flex-1 truncate">{command.label}</span>
      {command.shortcut && (
        <kbd
          className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-bg-muted)]
            px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]
            group-aria-selected:border-white/40 group-aria-selected:bg-white/20
            group-aria-selected:text-white/90"
        >
          {command.shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
