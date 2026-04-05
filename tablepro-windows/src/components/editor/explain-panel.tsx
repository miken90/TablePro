import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TreePine, FileText, X } from "lucide-react";
import type { ExplainResult } from "../../ipc/commands";
import { ExplainNodeRow } from "./explain-node";

interface ExplainPanelProps {
  result: ExplainResult;
  onClose: () => void;
}

type ViewMode = "tree" | "raw";

/** Default cost threshold above which a node is flagged as expensive. */
const COST_THRESHOLD = 1000;

export function ExplainPanel({ result, onClose }: ExplainPanelProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [expandAll, setExpandAll] = useState(false);

  const maxCost = useMemo(() => {
    let max = 0;
    function walk(nodes: ExplainResult["nodes"]) {
      for (const n of nodes) {
        if (n.cost !== null && n.cost > max) max = n.cost;
        walk(n.children);
      }
    }
    walk(result.nodes);
    return max;
  }, [result.nodes]);

  const threshold = Math.max(COST_THRESHOLD, maxCost * 0.7);

  const tabCls = (mode: ViewMode) =>
    `px-3 py-1 text-xs font-medium rounded-t border-b-2 ${
      viewMode === mode
        ? "border-accent-blue text-accent-blue"
        : "border-transparent text-text-muted hover:text-text-primary"
    }`;

  return (
    <div className="flex h-full flex-col border-t border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-1.5">
        <span className="text-xs font-semibold text-text-primary">{t("explain.title")}</span>
        <div className="flex-1" />
        <button className={tabCls("tree")} onClick={() => setViewMode("tree")}>
          <TreePine size={12} className="mr-1 inline" aria-hidden="true" />
          {t("explain.treeView")}
        </button>
        <button className={tabCls("raw")} onClick={() => setViewMode("raw")}>
          <FileText size={12} className="mr-1 inline" aria-hidden="true" />
          {t("explain.rawView")}
        </button>
        {viewMode === "tree" && result.nodes.length > 0 && (
          <button
            onClick={() => setExpandAll((v) => !v)}
            className="ml-2 rounded px-2 py-0.5 text-[10px] text-text-muted hover:bg-surface-muted hover:text-text-primary"
          >
            {expandAll ? t("explain.collapseAll") : t("explain.expandAll")}
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded p-0.5 text-text-muted hover:bg-surface-muted hover:text-text-primary"
          aria-label="Close explain panel"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "tree" ? (
          result.nodes.length > 0 ? (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface-elevated text-[10px] uppercase text-text-muted">
                  <th className="px-2 py-1 font-medium">{t("explain.operation")}</th>
                  <th className="px-2 py-1 font-medium">{t("explain.detail")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("explain.cost")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("explain.rows")}</th>
                </tr>
              </thead>
              <tbody>
                {result.nodes.map((node, i) => (
                  <ExplainNodeRow
                    key={i}
                    node={node}
                    depth={0}
                    costThreshold={threshold}
                    expandAll={expandAll}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-text-muted">
              {t("explain.noResult")}
            </div>
          )
        ) : (
          <pre className="whitespace-pre-wrap p-3 font-mono text-xs text-text-primary">
            {result.raw}
          </pre>
        )}
      </div>
    </div>
  );
}
