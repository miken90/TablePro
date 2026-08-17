import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { EnvironmentBadge } from './environment-badge';

interface ConnectionGroupProps {
  tag: string | null;
  label: string;
  count: number;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

export function ConnectionGroup({
  tag,
  label,
  count,
  defaultCollapsed = false,
  children,
}: ConnectionGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-zinc-400 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
        />
        {tag ? (
          <EnvironmentBadge tag={tag} />
        ) : (
          <span className="text-[10px] font-bold tracking-wide text-zinc-400 uppercase">{label}</span>
        )}
        <span className="ml-auto text-[10px] text-zinc-400">{count}</span>
      </button>

      {!collapsed && (
        <div className="flex flex-col">
          {children}
        </div>
      )}
    </div>
  );
}
