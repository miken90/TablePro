import { useState } from 'react';
import { Check, Copy, Key } from 'lucide-react';
import { NullBadge } from '../grid/cell-formatters/null-badge';
import { useSettingsStore } from '../../stores/settingsStore';

interface FieldRowProps {
  name: string;
  typeName: string;
  value: string | null;
  isPrimaryKey: boolean;
}

function isJsonLike(v: string): boolean {
  const t = v.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

function isBoolType(typeName: string): boolean {
  return typeName.toLowerCase().includes('bool');
}

export function FieldRow({ name, typeName, value, isPrimaryKey }: FieldRowProps) {
  // Same setting the grid renders NULL cells with — the Inspector shows the
  // same values and must not disagree with the cell the user clicked.
  const nullDisplay = useSettingsStore((s) => s.settings.nullDisplay);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const isLong = value !== null && value.length > 100;
  const isJson = value !== null && isJsonLike(value);
  const isBool = isBoolType(typeName);

  const renderValue = () => {
    if (value === null) {
      return <NullBadge text={nullDisplay} />;
    }
    if (isBool) {
      const checked = value === 'true' || value === '1' || value === 't';
      return (
        <span className="flex items-center gap-1 text-ui-xs text-text-primary">
          <input type="checkbox" checked={checked} readOnly className="pointer-events-none h-3 w-3" />
          {value}
        </span>
      );
    }
    if (isJson) {
      const display = isLong && !expanded ? value.slice(0, 100) + '...' : value;
      return (
        <button
          onClick={() => isLong && setExpanded((v) => !v)}
          className={`text-left font-mono text-ui-xs text-text-primary ${isLong ? 'cursor-pointer hover:text-accent-blue' : 'cursor-default'}`}
        >
          {display}
        </button>
      );
    }
    if (isLong && !expanded) {
      return (
        <button
          onClick={() => setExpanded(true)}
          className="text-left text-ui-xs text-text-primary hover:text-accent-blue"
        >
          {value.slice(0, 100)}
          <span className="text-text-muted" aria-hidden="true">...</span>
        </button>
      );
    }
    if (isLong && expanded) {
      return (
        <button
          onClick={() => setExpanded(false)}
          className="text-left text-ui-xs text-text-primary hover:text-accent-blue break-all"
        >
          {value}
        </button>
      );
    }
    return <span className="text-ui-xs text-text-primary">{value}</span>;
  };

  return (
    <div className="group flex items-start gap-2 border-b border-border-subtle px-3 py-1.5">
      <div className="flex min-w-0 shrink-0 items-center gap-1" style={{ width: '40%' }}>
        {isPrimaryKey && <Key size={10} className="shrink-0 text-grid-pk-fg" />}
        <span className="truncate text-ui-xs font-medium text-text-secondary" title={name}>
          {name}
        </span>
        <span className="shrink-0 rounded bg-surface-muted px-1 py-px text-ui-2xs text-text-secondary">
          {typeName}
        </span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden text-ui-xs flex items-start gap-1">
        <div className="flex-1 min-w-0">{renderValue()}</div>
        <button
          className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-text-primary shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(value === null ? 'NULL' : value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy value"
        >
          {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}
