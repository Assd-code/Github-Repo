"use client";

import * as React from "react";

interface Props {
  children: React.ReactNode;
  tabId: string;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // ChunkLoadError is common in dev mode when switching tabs
    console.warn(`Tab ${this.props.tabId} error:`, error.message);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error?.message?.includes("ChunkLoadError") ||
                           this.state.error?.message?.includes("Failed to load chunk");
      return (
        <div className="rounded-xl border bg-card p-8 text-center space-y-3">
          <div className="text-sm font-medium text-muted-foreground">
            {isChunkError ? "Loading panels..." : "Something went wrong"}
          </div>
          <div className="text-xs text-muted-foreground">
            {isChunkError
              ? "The dev server is compiling this tab's panels. This only happens in development mode."
              : this.state.error?.message}
          </div>
          <button
            onClick={this.handleRetry}
            className="rounded-md border bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
