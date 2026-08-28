import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { useCommandStore } from '../../../hooks/useCommandRegistry';
import type { CommandCategory } from '../../../hooks/useCommandRegistry';
import { CommandItem } from './command-item';
import { Field } from '../../ui';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_ORDER: CommandCategory[] = ['Navigation', 'Query', 'Edit', 'View', 'Settings'];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const { getFilteredCommands, getRecentCommands, executeCommand } = useCommandStore();

  // Reset search when opened
  /* eslint-disable react-hooks/set-state-in-effect -- reset state on open */
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = getFilteredCommands(query);
  const recentCmds = getRecentCommands();

  // Group by category
  const grouped = CATEGORY_ORDER.reduce<Record<CommandCategory, typeof filtered>>(
    (acc, cat) => {
      acc[cat] = filtered.filter((c) => c.category === cat);
      return acc;
    },
    { Navigation: [], Query: [], Edit: [], View: [], Settings: [] },
  );

  const handleSelect = (id: string) => {
    executeCommand(id);
    onOpenChange(false);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      className="fixed inset-0 z-50"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div className="fixed left-1/2 top-[15vh] w-[560px] max-w-[90vw] -translate-x-1/2 animate-slide-down overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-modal">
        {/* Input */}
        <Field className="m-2">
          <svg
            className="mr-3 h-4 w-4 shrink-0 text-[var(--color-text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]"
          />
          <kbd
            className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]"
          >
            Esc
          </kbd>
        </Field>

        {/* Results */}
        <Command.List className="max-h-[400px] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
            No commands found.
          </Command.Empty>

          {/* Recent commands — shown only when no query */}
          {query === '' && recentCmds.length > 0 && (
            <Command.Group
              heading="Recent"
              className="[&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--color-text-secondary)]"
            >
              {recentCmds.map((cmd) => (
                <CommandItem key={cmd.id} command={cmd} onSelect={() => handleSelect(cmd.id)} />
              ))}
            </Command.Group>
          )}

          {/* Grouped commands */}
          {CATEGORY_ORDER.map((cat) => {
            const cmds = grouped[cat];
            if (cmds.length === 0) return null;
            return (
              <Command.Group
                key={cat}
                heading={cat}
                className="[&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:mt-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--color-text-secondary)]"
              >
                {cmds.map((cmd) => (
                  <CommandItem key={cmd.id} command={cmd} onSelect={() => handleSelect(cmd.id)} />
                ))}
              </Command.Group>
            );
          })}
        </Command.List>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-[var(--color-border-subtle)] px-4 py-2">
          <span className="text-[10px] text-[var(--color-text-secondary)]">
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>{' '}
            navigate
          </span>
          <span className="text-[10px] text-[var(--color-text-secondary)]">
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-1 py-0.5 font-mono text-[10px]">↵</kbd>{' '}
            run
          </span>
          <span className="text-[10px] text-[var(--color-text-secondary)]">
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-1 py-0.5 font-mono text-[10px]">Esc</kbd>{' '}
            close
          </span>
          <span className="ml-auto text-[10px] text-[var(--color-text-secondary)]">
            Ctrl+Shift+P
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}
