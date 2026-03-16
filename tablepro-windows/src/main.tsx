import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

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

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
