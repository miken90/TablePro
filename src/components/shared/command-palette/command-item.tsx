import { Command } from 'cmdk';
import type { Command as AppCommand } from '../../../hooks/useCommandRegistry';
import { Kbd } from '../../ui';

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
        <Kbd className="shrink-0 group-aria-selected:border-white/40 group-aria-selected:text-white/90">
          {command.shortcut}
        </Kbd>
      )}
    </Command.Item>
  );
}
