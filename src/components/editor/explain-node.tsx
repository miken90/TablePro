import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ExplainNode as ExplainNodeType } from "../../ipc/commands";

interface ExplainNodeProps {
  node: ExplainNodeType;
  depth: number;
  costThreshold: number;
  expandAll: boolean;
}

export function ExplainNodeRow({ node, depth, costThreshold, expandAll }: ExplainNodeProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isExpensive = node.cost !== null && node.cost > costThreshold;

  const isOpen = expandAll || expanded;

  return (
    <>
      <tr
        className={`border-b border-border-subtle hover:bg-surface-muted ${
          isExpensive ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""
        }`}
      >
        <td className="px-2 py-1 text-xs" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex-shrink-0 rounded p-0.5 hover:bg-surface-elevated"
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                {isOpen ? (
                  <ChevronDown size={12} aria-hidden="true" />
                ) : (
                  <ChevronRight size={12} aria-hidden="true" />
                )}
              </button>
            ) : (
              <span className="inline-block w-[16px]" />
            )}
            <span className={`font-medium ${isExpensive ? "text-yellow-600 dark:text-yellow-400" : "text-text-primary"}`}>
              {node.operation}
            </span>
            {isExpensive && (
              <span className="ml-1 rounded bg-yellow-100 px-1 py-0.5 text-[10px] font-medium text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
                {t("explain.expensiveNode")}
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-1 text-xs text-text-secondary max-w-[300px] truncate" title={node.detail}>
          {node.detail}
        </td>
        <td className="px-2 py-1 text-xs text-right tabular-nums text-text-secondary">
          {node.cost !== null ? node.cost.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
        </td>
        <td className="px-2 py-1 text-xs text-right tabular-nums text-text-secondary">
          {node.rows !== null ? node.rows.toLocaleString() : "—"}
        </td>
      </tr>
      {isOpen &&
        hasChildren &&
        node.children.map((child, i) => (
          <ExplainNodeRow
            key={i}
            node={child}
            depth={depth + 1}
            costThreshold={costThreshold}
            expandAll={expandAll}
          />
        ))}
    </>
  );
}
