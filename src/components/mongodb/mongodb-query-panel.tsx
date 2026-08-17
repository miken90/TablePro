import { useState, useCallback } from "react";
import { Play, Loader2 } from "lucide-react";
import { useSchemaStore } from "../../stores/schemaStore";
import { resolveActiveQuerySessionId, useQueryStore } from "../../stores/queryStore";
import { useSettingsStore } from "../../stores/settingsStore";

/**
 * MongoDB find() query panel — replaces the SQL editor for MongoDB connections.
 * Provides collection selector + JSON filter/sort/limit inputs.
 * Sends JSON command string via standard execute_query IPC.
 */
export function MongodbQueryPanel() {
  const tables = useSchemaStore((s) => s.tables);
  const [collection, setCollection] = useState("");
  const [filter, setFilter] = useState("{}");
  const [sort, setSort] = useState("{}");
  const [limit, setLimit] = useState("100");
  const isExecuting = useQueryStore((s) => s.isExecuting);
  const execute = useQueryStore((s) => s.execute);
  const safeModeLevel = useSettingsStore((s) => s.settings.safeModeLevel);

  const handleExecute = useCallback(() => {
    const sessionId = resolveActiveQuerySessionId();
    if (!sessionId || !collection) return;

    let parsedFilter: unknown;
    try {
      parsedFilter = filter.trim() ? JSON.parse(filter) : {};
    } catch {
      parsedFilter = {};
    }

    let parsedSort: unknown;
    try {
      parsedSort = sort.trim() ? JSON.parse(sort) : {};
    } catch {
      parsedSort = {};
    }

    let parsedLimit = 100;
    const limitNum = parseInt(limit, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      parsedLimit = limitNum;
    }

    const command = JSON.stringify({
      collection,
      filter: parsedFilter,
      sort: parsedSort,
      limit: parsedLimit,
    });

    void execute(sessionId, command, undefined, safeModeLevel);
  }, [collection, filter, sort, limit, execute, safeModeLevel]);

  const inputCls =
    "rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 font-mono outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <label className="text-[11px] font-medium text-text-muted">Collection</label>
        <select
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
          className={`${inputCls} min-w-[160px]`}
        >
          <option value="">Select collection…</option>
          {tables.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleExecute}
          disabled={isExecuting || !collection}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          title="Execute find()"
        >
          {isExecuting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          Find
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-text-muted">Filter (JSON)</label>
          <textarea
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder='{"age": {"$gt": 25}}'
            rows={3}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-text-muted">Sort (JSON)</label>
          <textarea
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            placeholder='{"name": 1}'
            rows={3}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-text-muted">Limit</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min={1}
            max={10000}
            className={inputCls}
          />
        </div>
      </div>
    </div>
  );
}
