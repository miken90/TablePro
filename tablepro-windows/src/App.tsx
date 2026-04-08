import { useEffect } from "react";
import "./styles/globals.css";
import "./i18n";
import { MainLayout } from "./components/layout/MainLayout";
import { ErrorBoundary } from "./components/shared/error-boundary";
import { ToastProvider } from "./components/shared/toast-provider";
import { SkipLink } from "./components/shared/skip-link";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { listen } from "@tauri-apps/api/event";
import { handleDeepLinkUrl } from "./utils/deep-link-handler";
import { handleFileOpen } from "./utils/file-open-handler";

export default function App() {
  queueMicrotask(() => {
    console.error("[startup] App component rendered");
  });

  // Register deep-link listener once on mount.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onOpenUrl((urls: string[]) => {
      for (const url of urls) {
        void handleDeepLinkUrl(url);
      }
    })
      .then((fn) => { unlisten = fn; })
      .catch((err) => {
        console.error("[deep-link] Failed to register listener:", err);
      });
    return () => unlisten?.();
  }, []);

  // Listen for file-open events (double-click from Explorer)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>("file-open", (event) => {
      void handleFileOpen(event.payload);
    })
      .then((fn) => { unlisten = fn; })
      .catch((err) => {
        console.error("[file-open] Failed to register listener:", err);
      });
    return () => unlisten?.();
  }, []);

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
