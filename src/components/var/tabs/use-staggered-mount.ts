"use client";

import * as React from "react";

// Hook that returns true after a delay, used to stagger panel mounts
// so they don't all make API calls simultaneously.
export function useStaggeredMount(index: number, delay = 300): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setMounted(true), index * delay);
    return () => clearTimeout(timer);
  }, [index, delay]);
  return mounted;
}
