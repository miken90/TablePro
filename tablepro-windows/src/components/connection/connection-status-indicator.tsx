import type { ConnectionStatus } from '../../types/connection';

const STATUS_CLASSES: Record<ConnectionStatus, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-zinc-400 dark:bg-zinc-600',
  error: 'bg-red-500',
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
  error: 'Connection error',
};

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
}

export function ConnectionStatusIndicator({ status }: ConnectionStatusIndicatorProps) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-150 ${STATUS_CLASSES[status]}`}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    />
  );
}
