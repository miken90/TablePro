import "./styles/globals.css";
import { MainLayout } from "./components/layout/MainLayout";
import { ErrorBoundary } from "./components/shared/error-boundary";
import { ToastProvider } from "./components/shared/toast-provider";
import { SkipLink } from "./components/shared/skip-link";

export default function App() {
  queueMicrotask(() => {
    console.error("[startup] App component rendered");
  });

  return (
    <ErrorBoundary>
      {/* Skip link: first focusable element for keyboard users */}
      <SkipLink />
      <MainLayout />
      <ToastProvider />
      {/* Live region for screen reader announcements */}
      <div
        id="sr-announcer"
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        aria-relevant="additions text"
      />
    </ErrorBoundary>
  );
}
