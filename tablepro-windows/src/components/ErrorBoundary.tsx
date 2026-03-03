import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-900">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Something went wrong
          </h1>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
