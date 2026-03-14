import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  description?: string;
}

export function EmptyState({ icon, message, description }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-600">
      {icon && <div className="opacity-50">{icon}</div>}
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{message}</p>
      {description && (
        <p className="max-w-xs text-center text-xs text-zinc-400 dark:text-zinc-500">{description}</p>
      )}
    </div>
  );
}
