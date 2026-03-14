import type { QueryResult } from "../../types/query";
import { useSettingsStore } from "../../stores/settingsStore";

interface SimpleGridProps {
  result: QueryResult;
}

export function SimpleGrid({ result }: SimpleGridProps) {
  const nullDisplay = useSettingsStore((s) => s.settings.nullDisplay);
  const { columns, rows } = result;

  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        Query returned no columns.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            {/* Row number header */}
            <th className="border-b border-r border-zinc-200 bg-zinc-100 px-2 py-1 text-right text-[10px] font-normal text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col.name}
                className="border-b border-r border-zinc-200 bg-zinc-100 px-2 py-1 text-left font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <div className="flex items-center gap-1">
                  {col.name}
                  <span className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                    {col.typeName}
                    {col.isPrimaryKey && " 🔑"}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <td className="border-b border-r border-zinc-100 px-2 py-0.5 text-right text-[10px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                {rowIdx + 1}
              </td>
              {row.map((cell, colIdx) => (
                <td
                  key={colIdx}
                  className="border-b border-r border-zinc-100 px-2 py-0.5 dark:border-zinc-800"
                >
                  {cell === null ? (
                    <span className="italic text-zinc-400 dark:text-zinc-600">{nullDisplay}</span>
                  ) : (
                    <span className="text-zinc-700 dark:text-zinc-300">{cell}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
