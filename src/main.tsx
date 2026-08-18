import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { recordSessionStart } from "./metrics/local-metrics";

declare const __APP_VERSION__: string;

// Disable devtools access in production builds
if (import.meta.env.PROD) {
  // Block right-click context menu
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  // Block F12 and Ctrl+Shift+I/J/C
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key))
    ) {
      e.preventDefault();
    }
  });
}

function logRendererError(kind: string, detail: string) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${kind}: ${detail}`;
  console.error(message);
  void invoke("log_renderer_error", { message }).catch(() => {});
}

logRendererError("startup", "main.tsx loaded");

// Window lifecycle events (beforeunload / pagehide / visibilitychange) used
// to be logged here. Every tab switch and every minimise wrote a line, which
// is how the error log ended up ~90% noise; they say nothing about a crash
// that the startup line and the two handlers below do not.

window.addEventListener("error", (event) => {
  const detail = `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`;
  logRendererError("window.error", detail);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? `${event.reason.message}\n${event.reason.stack ?? ""}` : String(event.reason);
  logRendererError("unhandledrejection", reason);
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

logRendererError("startup", "root element found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

recordSessionStart(__APP_VERSION__);
