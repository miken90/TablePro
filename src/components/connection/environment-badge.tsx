type Environment = 'production' | 'staging' | 'development' | 'testing' | 'local';

const ENV_STYLES: Record<Environment, string> = {
  production: 'bg-red-500/20 text-red-400 border-red-500/30',
  staging: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  development: 'bg-green-500/20 text-green-400 border-green-500/30',
  testing: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  local: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const ENV_LABELS: Record<Environment, string> = {
  production: 'PROD',
  staging: 'STAGE',
  development: 'DEV',
  testing: 'TEST',
  local: 'LOCAL',
};

interface EnvironmentBadgeProps {
  tag?: string | null;
}

export function EnvironmentBadge({ tag }: EnvironmentBadgeProps) {
  if (!tag) return null;

  const env = tag.toLowerCase() as Environment;
  const colorClass = ENV_STYLES[env] ?? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
  const label = ENV_LABELS[env] ?? tag.toUpperCase().slice(0, 5);

  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${colorClass}`}
    >
      {label}
    </span>
  );
}
