"use client";
// The tables' refresh buttons: refetch the current query (same filter, sort and page) and report
// `refreshing` for at least MIN_MS, so the console-style loading rows are visible even when the API
// answers instantly. Normal paging still uses keepPreviousData and doesn't go through here.
import { useCallback, useState } from "react";

const MIN_MS = 300;

export function useRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), new Promise((resolve) => setTimeout(resolve, MIN_MS))]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return { refreshing, refresh };
}
