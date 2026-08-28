import type { ConnectionStatus } from '../../types/connection';

const STATUS_CLASSES: Record<ConnectionStatus, string> = {
  connected: 'bg-accent-green',
  connecting: 'bg-accent-yellow animate-pulse',
  disconnected: 'bg-text-muted',
  error: 'bg-accent-red',
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

/** Status dot (design-spec 5.16 Card anatomy) — 6px, radius-full. */
export function ConnectionStatusIndicator({ status }: ConnectionStatusIndicatorProps) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150 ${STATUS_CLASSES[status]}`}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    />
  );
}
