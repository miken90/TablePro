import { useId, useRef, type ReactNode } from "react";
import { useFocusTrap } from "./use-focus-trap";
import { Button, type ButtonVariant } from "./button";

export type DialogSize = "sm" | "md" | "lg";

const SIZE_MAX_WIDTH: Record<DialogSize, string> = {
  sm: "max-w-[420px]",
  md: "max-w-[560px]",
  lg: "max-w-[760px]",
};

export interface DialogAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: DialogSize;
  /**
   * A destructive confirm: initial focus goes to Cancel, never the commit
   * action (design-spec 5.16, AUDIT M5 — "never on the destructive action").
   */
  destructive?: boolean;
  cancelLabel?: string;
  /** Right-aligned after Cancel, which always renders first/left. */
  actions?: DialogAction[];
  children: ReactNode;
}

/**
 * Canonical `.dialog` (design-spec 5.16, AUDIT consistency #3): banded
 * header/body/footer, no border, `role="dialog" aria-modal="true"`, focus
 * trapped, Esc closes, focus returns to the trigger on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  size = "md",
  destructive = false,
  cancelLabel = "Cancel",
  actions = [],
  children,
}: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useFocusTrap(containerRef, {
    active: open,
    onEscape: onClose,
    initialFocusRef: destructive ? cancelRef : undefined,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal-scrim flex items-center justify-center bg-scrim p-3xl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          "z-modal flex w-full flex-col rounded-lg bg-surface-elevated shadow-modal",
          "max-h-[min(680px,calc(100vh-var(--space-3xl)*2))]",
          SIZE_MAX_WIDTH[size],
        ].join(" ")}
      >
        <header className="flex-none border-b border-border-subtle px-2xl py-xl">
          <h1 id={titleId} className="text-ui-xl font-semibold text-text-primary">
            {title}
          </h1>
        </header>
        <div className="flex-1 overflow-auto p-2xl">{children}</div>
        <footer className="flex flex-none items-center justify-end gap-md border-t border-border-subtle px-2xl py-lg">
          <Button ref={cancelRef} variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "primary"}
              onClick={action.onClick}
              loading={action.loading}
              disabled={action.disabled}
            >
              {action.label}
            </Button>
          ))}
        </footer>
      </div>
    </div>
  );
}
