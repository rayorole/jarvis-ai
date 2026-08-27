/**
 * TanStack Query hooks over the memory API (`/api/memory*`).
 *
 * The memory store's `version` acts as the optimistic-concurrency token:
 * every mutation carries `expectedVersion` and a 409 triggers a refetch so
 * the canonical server state replaces any optimistic view.
 */
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import {
  decidePendingWrite,
  getMemoryStore,
  mutateMemory,
  MemoryApiError,
  type MemoryMutation,
  type MemoryStore,
  type MemoryTab,
  type PendingWrite,
} from "./memory-api";

export const MEMORY_KEY_ROOT = ["memory"] as const;

export function useMemoryStore(tab: MemoryTab): UseQueryResult<MemoryStore, Error> {
  return useQuery<MemoryStore, Error>({
    queryKey: [...MEMORY_KEY_ROOT, tab],
    queryFn: ({ signal }) => getMemoryStore(tab, signal),
    // Never retry: version conflicts must surface immediately.
    retry: false,
  });
}

function useInvalidateMemory() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: MEMORY_KEY_ROOT });
}

export function useStageMemoryMutation(): UseMutationResult<
  { ok?: boolean; pendingWrite?: PendingWrite },
  Error,
  { tab: MemoryTab; mutation: Omit<MemoryMutation, "stage"> }
> {
  const invalidate = useInvalidateMemory();
  return useMutation({
    mutationFn: ({ tab, mutation }) => mutateMemory(tab, { ...mutation, stage: "stage" }),
    onSuccess: invalidate,
  });
}

export function useCommitMemoryMutation(): UseMutationResult<
  { ok?: boolean },
  Error,
  { tab: MemoryTab; mutation: Omit<MemoryMutation, "stage">; pendingWriteId: string },
  // Snapshot for rollback-free canonical reconciliation on conflict.
  unknown
> {
  const invalidate = useInvalidateMemory();
  return useMutation({
    mutationFn: ({ tab, mutation, pendingWriteId }) =>
      mutateMemory(tab, { ...mutation, stage: "commit", pendingWriteId }),
    onSuccess: invalidate,
    // On conflict (409) refetching the canonical store is the rollback.
    onSettled: (_data, error) => {
      if (error instanceof MemoryApiError && error.status === 409) invalidate();
    },
  });
}

export function useDecidePendingWriteMutation(): UseMutationResult<
  { ok?: boolean },
  Error,
  { tab: MemoryTab; pendingWriteId: string; action: "approve" | "reject" }
> {
  const invalidate = useInvalidateMemory();
  return useMutation({
    mutationFn: ({ tab, pendingWriteId, action }) => decidePendingWrite(tab, pendingWriteId, action),
    onSuccess: invalidate,
    onSettled: invalidate,
  });
}
