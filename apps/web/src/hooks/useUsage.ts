/**
 * Data hook for the usage/cost dashboards (issue #14 scope). All upstream
 * contact goes through the same-origin gateway proxy; payloads are normalized
 * via @/lib/usage-api before any component sees them.
 *
 * Polling lifecycle: bounded interval (30s), paused while the tab is hidden
 * and while the browser is offline, resumed automatically on visibility or
 * connectivity recovery — via React Query's own refetch controls so there is
 * exactly one timer regardless of visibility transitions.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { normalizeUsageSnapshot, type UsageSnapshot } from "@/lib/usage-api";

export const USAGE_QUERY_KEY = ["usage"] as const;

/** Bounded polling interval in milliseconds. */
export const USAGE_POLL_INTERVAL_MS = 30_000;

async function getUsageSnapshot(): Promise<UsageSnapshot> {
  const res = await fetch("/api/gateway/usage", { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  const body: unknown = await res.json();
  return normalizeUsageSnapshot(body);
}

export function useUsage() {
  const [isLive, setIsLive] = useState(true);

  const query = useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: getUsageSnapshot,
    refetchInterval: isLive ? USAGE_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const update = () => setIsLive(!document.hidden && navigator.onLine);
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return { ...query, isLive };
}
