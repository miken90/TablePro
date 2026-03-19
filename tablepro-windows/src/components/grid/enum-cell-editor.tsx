import React from 'react';

interface EnumCellEditorProps {
  values: string[];
  value: string | null;
  isSet: boolean;
  isNull: boolean;
  disabled: boolean;
  onChangeValue: (next: string) => void;
  onChangeSetValues: (next: string[]) => void;
}

export function EnumCellEditor({
  values,
  value,
  isSet,
  isNull,
  disabled,
  onChangeValue,
  onChangeSetValues,
}: EnumCellEditorProps) {
  if (isSet) {
    const selected = new Set(
      (value ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    );

    return (
      <div className="max-h-28 overflow-auto border border-zinc-300 rounded px-1 py-1 dark:border-zinc-600">
        {values.map((option) => {
          const checked = selected.has(option);
          return (
            <label key={option} className="flex items-center gap-1 py-0.5 text-xs">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || isNull}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(option);
                  else next.delete(option);
                  onChangeSetValues(Array.from(next));
                }}
              />
              <span className="truncate">{option}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <select
      value={isNull ? '' : (value ?? '')}
      disabled={disabled || isNull}
      onChange={(e) => onChangeValue(e.target.value)}
      className="w-full border border-zinc-300 rounded px-1 py-0.5 text-xs dark:bg-zinc-700 dark:border-zinc-600"
    >
      <option value="">{isNull ? '[NULL]' : 'Select value'}</option>
      {values.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
