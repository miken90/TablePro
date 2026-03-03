import { useSettingsStore } from "../../stores/settings";

export function HistorySettings() {
  const { settings, updateSection } = useSettingsStore();
  if (!settings) return null;
  const history = settings.history;

  const update = (patch: Partial<typeof history>) => {
    updateSection("history", { ...history, ...patch });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">History</h3>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">
          Maximum Entries (0 = unlimited)
        </label>
        <input
          type="number"
          min={0}
          max={100000}
          value={history.maxEntries}
          onChange={(e) => update({ maxEntries: Number(e.target.value) })}
          className="input-field w-28"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">
          Retention Days (0 = unlimited)
        </label>
        <input
          type="number"
          min={0}
          max={365}
          value={history.maxDays}
          onChange={(e) => update({ maxDays: Number(e.target.value) })}
          className="input-field w-28"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Auto Cleanup</span>
        <button
          onClick={() => update({ autoCleanup: !history.autoCleanup })}
          className={`relative h-5 w-9 rounded-full transition ${history.autoCleanup ? "bg-blue-600" : "bg-zinc-600"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${history.autoCleanup ? "left-4" : "left-0.5"}`}
          />
        </button>
      </div>

      <div className="pt-4">
        <button className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition hover:bg-red-900/30">
          Clear All History
        </button>
      </div>
    </div>
  );
}
