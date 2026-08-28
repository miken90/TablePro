import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  description?: string;
}

export function EmptyState({ icon, message, description }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
      {icon && <div className="opacity-50">{icon}</div>}
      <p className="text-sm font-medium text-text-secondary">{message}</p>
      {description && (
        <p className="max-w-xs text-center text-xs text-text-secondary">{description}</p>
      )}
    </div>
  );
}
