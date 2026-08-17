import React from "react";
import { classifyError } from "../../ipc/error";

interface Props {
  children: React.ReactNode;
  /** Region name for logging (e.g. "sidebar", "editor"). */
  name?: string;
  /** Custom fallback UI. When omitted the default error card is shown. */
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name ?? "unknown"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      const classified = classifyError(this.state.error);
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950">
            <h2 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">
              Something went wrong
            </h2>
            <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-red-600 dark:text-red-300">
              {classified.message}
            </pre>
            {classified.hint && (
              <p className="mb-4 text-xs text-red-500 dark:text-red-400">
                <span className="font-medium">Hint: </span>
                {classified.hint}
              </p>
            )}
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
