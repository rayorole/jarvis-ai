/**
 * Gateway health/status hook (issue #13).
 *
 * Polls the same-origin health endpoint via TanStack Query; the status page
 * and any status badges consume this single hook so cache keys stay coherent.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchGatewayHealth, type GatewayHealth } from "./gateway-status";

export const GATEWAY_HEALTH_KEY = ["gateway", "health"] as const;

/** Poll gateway health; single retry so transient blips don't page the UI. */
export function useGatewayHealth(refreshMs = 30_000): UseQueryResult<GatewayHealth, Error> {
  return useQuery<GatewayHealth, Error>({
    queryKey: GATEWAY_HEALTH_KEY,
    queryFn: ({ signal }) => fetchGatewayHealth(signal),
    refetchInterval: refreshMs,
    retry: 1,
  });
}
