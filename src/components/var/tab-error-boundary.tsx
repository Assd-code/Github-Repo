"use client";

import * as React from "react";

interface Props {
  children: React.ReactNode;
  tabId: string;
}
interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class TabErrorBoundary extends React.Component<Props, State> {
  retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, retryCount: 0 };
  }

  componentDidCatch(error: Error) {
    console.warn(`Tab ${this.props.tabId} error:`, error.message);
    // Auto-retry on ChunkLoadError (common in dev mode when the server
    // is still compiling chunks or was temporarily OOM)
    const isChunkError =
      error.message?.includes("ChunkLoadError") ||
      error.message?.includes("Failed to load chunk") ||
      error.message?.includes("fetch dynamically imported module");

    if (isChunkError && this.state.retryCount < 3) {
      this.retryTimer = setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1,
        }));
      }, 3000 + this.state.retryCount * 2000); // 3s, 5s, 7s
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, retryCount: 0 });
  };

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes("ChunkLoadError") ||
        this.state.error?.message?.includes("Failed to load chunk") ||
        this.state.error?.message?.includes("fetch dynamically imported module");
      const isRetrying = this.state.retryCount < 3 && isChunkError;

      return (
        <div className="rounded-xl border bg-card p-8 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            {isRetrying ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm font-medium text-muted-foreground">
                  Loading tab content... (retry {this.state.retryCount + 1}/3)
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                {isChunkError ? "Still compiling..." : "Something went wrong"}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto">
            {isChunkError
              ? "The dev server is compiling this tab's panels. This only happens in development mode — production builds pre-compile everything."
              : this.state.error?.message}
          </div>
          {!isRetrying && (
            <button
              onClick={this.handleRetry}
              className="rounded-md border bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
