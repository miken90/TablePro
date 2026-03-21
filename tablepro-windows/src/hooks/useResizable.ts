import { useCallback } from "react";

interface UseResizableOptions {
  direction: "horizontal" | "vertical";
  min: number;
  max: number;
  onResize: (value: number) => void;
  /** For horizontal: provide the current width to compute delta from. For vertical: ignored. */
  currentValue?: number;
  /** For vertical resize: CSS selector of the container to calculate percentage against. */
  containerSelector?: string;
  /** If true, delta is inverted (e.g. inspector resizing from right edge). */
  invert?: boolean;
}

export function useResizable(opts: UseResizableOptions) {
  const { direction, min, max, onResize, currentValue, containerSelector, invert } = opts;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      if (direction === "horizontal") {
        if (currentValue === undefined) return;
        const startX = e.clientX;
        const startWidth = currentValue ?? 0;
        const onMove = (mv: MouseEvent) => {
          const delta = invert ? -(mv.clientX - startX) : mv.clientX - startX;
          const next = Math.min(max, Math.max(min, startWidth + delta));
          onResize(next);
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      } else {
        const container = containerSelector
          ? (e.currentTarget as HTMLElement).closest(containerSelector) as HTMLElement
          : null;
        if (!container) return;
        const onMove = (mv: MouseEvent) => {
          const rect = container.getBoundingClientRect();
          const pct = Math.min(max, Math.max(min, ((mv.clientY - rect.top) / rect.height) * 100));
          onResize(pct);
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }
    },
    [direction, min, max, onResize, currentValue, containerSelector, invert],
  );

  return { onMouseDown };
}
