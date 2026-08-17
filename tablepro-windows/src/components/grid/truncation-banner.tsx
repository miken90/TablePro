import { useTranslation } from "react-i18next";
import { useQueryResultStore } from "../../stores/queryResultStore";

/**
 * Banner shown above the data grid when the streaming store hit
 * `storeMaxRows` and is dropping further server rows.
 *
 * Wiring into the grid layout is Task 6's responsibility — this
 * component is exported standalone.
 */
export function TruncationBanner() {
  const { t } = useTranslation();
  const truncated = useQueryResultStore((s) => s.truncated);
  const stored = useQueryResultStore((s) => s.columnar?.row_count ?? 0);
  const total = useQueryResultStore((s) => s.totalRowsServer);

  if (!truncated) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="px-3 py-1.5 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-200 dark:text-amber-200 dark:bg-amber-950/40 dark:border-amber-900"
    >
      {t("truncationBanner.message", {
        count: stored.toLocaleString(),
        total: total.toLocaleString(),
        defaultValue:
          "Showing first {{count}} of {{total}} rows. Export to file for the full result.",
      })}
    </div>
  );
}
