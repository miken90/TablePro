import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      visibleToasts={3}
      closeButton
      theme="dark"
      toastOptions={{
        style: {
          background: "var(--color-surface-elevated, #1e1e2e)",
          border: "1px solid var(--color-border, #313244)",
          color: "var(--color-text-primary, #cdd6f4)",
        },
      }}
    />
  );
}
