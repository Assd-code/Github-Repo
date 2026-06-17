"use client";

import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  const isChunkError =
    error?.message?.includes("ChunkLoadError") ||
    error?.message?.includes("Failed to load chunk") ||
    error?.message?.includes("fetch dynamically imported module");

  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-xl border bg-card p-6 text-center space-y-4">
        <div className="flex justify-center">
          {isChunkError ? (
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <AlertCircle className="h-10 w-10 text-rose-500" />
          )}
        </div>
        <div>
          <h2 className="text-base font-semibold">
            {isChunkError ? "Loading..." : "Something went wrong"}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isChunkError
              ? "The dev server is compiling panels. Please wait or click retry."
              : error?.message || "An unexpected error occurred."}
          </p>
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
