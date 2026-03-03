import { useSettingsStore } from "../../stores/settings";

const dateFormats = [
  { value: "yyyy-MM-dd HH:mm:ss", label: "ISO 8601 (2024-12-31 23:59:59)" },
  { value: "yyyy-MM-dd", label: "ISO Date (2024-12-31)" },
  { value: "MM/dd/yyyy hh:mm:ss a", label: "US Long (12/31/2024 11:59:59 PM)" },
  { value: "MM/dd/yyyy", label: "US Short (12/31/2024)" },
  { value: "dd/MM/yyyy HH:mm:ss", label: "EU Long (31/12/2024 23:59:59)" },
  { value: "dd/MM/yyyy", label: "EU Short (31/12/2024)" },
];

export function DataGridSettings() {
  const { settings, updateSection } = useSettingsStore();
  if (!settings) return null;
  const grid = settings.dataGrid;

  const update = (patch: Partial<typeof grid>) => {
    updateSection("dataGrid", { ...grid, ...patch });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Data Grid</h3>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Row Height</label>
        <select
          value={grid.rowHeight}
          onChange={(e) =>
            update({ rowHeight: e.target.value as typeof grid.rowHeight })
          }
          className="select-field"
        >
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="comfortable">Comfortable</option>
          <option value="spacious">Spacious</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Date Format</label>
        <select
          value={grid.dateFormat}
          onChange={(e) => update({ dateFormat: e.target.value })}
          className="select-field"
        >
          {dateFormats.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">NULL Display</label>
        <input
          type="text"
          value={grid.nullDisplay}
          onChange={(e) => update({ nullDisplay: e.target.value })}
          maxLength={20}
          className="input-field w-32"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Default Page Size</label>
        <input
          type="number"
          min={10}
          max={100000}
          value={grid.defaultPageSize}
          onChange={(e) => update({ defaultPageSize: Number(e.target.value) })}
          className="input-field w-28"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Alternate Row Colors</span>
        <button
          onClick={() => update({ showAlternateRows: !grid.showAlternateRows })}
          className={`relative h-5 w-9 rounded-full transition ${grid.showAlternateRows ? "bg-blue-600" : "bg-zinc-600"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${grid.showAlternateRows ? "left-4" : "left-0.5"}`}
          />
        </button>
      </div>
    </div>
  );
}
