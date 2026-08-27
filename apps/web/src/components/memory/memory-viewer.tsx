/**
 * Memory and user-profile viewer with staged writes (issue #11 / #12).
 *
 * Two tabs (agent memory / user profile) over the same `/api/memory` seam.
 * Mutations are staged server-side (pending writes) and only applied on
 * explicit approve; removal is destructive and asks for confirmation first.
 * Every mutation carries `expectedVersion`; a 409 surfaces a conflict alert
 * and the canonical server state replaces the local view.
 *
 * Frozen-at-session-start semantics: memory changes affect new sessions only;
 * running sessions keep the prompt snapshot taken at their start. The warning
 * is visible before any mutation completes.
 */
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MEMORY_MAX_CONTENT_LENGTH,
  MemoryApiError,
  type MemoryEntry,
  type MemoryStore,
  type MemoryTab,
} from "../../lib/memory-api";
import {
  useCommitMemoryMutation,
  useDecidePendingWriteMutation,
  useMemoryStore,
  useStageMemoryMutation,
} from "../../lib/use-memory";

/** Fresh QueryClient per mount so cached entries never leak across mounts. */
export function MemoryViewer(): ReactNode {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryViewerInner />
    </QueryClientProvider>
  );
}

function MemoryViewerInner(): ReactNode {
  const [tab, setTab] = useState<MemoryTab>("agent");
  const store = useMemoryStore(tab);

  return (
    <section aria-labelledby="memory-title">
      <h2 id="memory-title">Memory</h2>
      <div role="tablist" aria-label="Memory stores">
        <button role="tab" aria-selected={tab === "agent"} onClick={() => setTab("agent")}>
          Agent memory
        </button>
        <button role="tab" aria-selected={tab === "profile"} onClick={() => setTab("profile")}>
          User profile
        </button>
      </div>
      <p>
        Memory changes affect new sessions; existing sessions keep their
        snapshot from when they started.
      </p>
      {store.isPending ? (
        <p>Loading memory…</p>
      ) : store.isError ? (
        <p role="alert">Could not load memory: {String(store.error)}</p>
      ) : (
        <MemoryStoreView tab={tab} store={store.data} />
      )}
    </section>
  );
}

function MemoryStoreView({ tab, store }: { tab: MemoryTab; store: MemoryStore }): ReactNode {
  const [draft, setDraft] = useState("");
  const [confirmingRemoval, setConfirmingRemoval] = useState<MemoryEntry | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const stage = useStageMemoryMutation();
  const commit = useCommitMemoryMutation();
  const decide = useDecidePendingWriteMutation();

  const overBudget = store.budget.limit > 0 && store.budget.used > store.budget.limit;

  function stageAdd(): void {
    setInputError(null);
    const content = draft.trim();
    if (content.length === 0) {
      setInputError("Memory content must not be empty.");
      return;
    }
    if (content.length > MEMORY_MAX_CONTENT_LENGTH) {
      setInputError(`Memory content exceeds the ${MEMORY_MAX_CONTENT_LENGTH} character limit.`);
      return;
    }
    stage.mutate(
      { tab, mutation: { operation: "add", content, expectedVersion: store.version } },
      { onError: () => setInputError("Staging the write failed. Try again.") },
    );
  }

  function approve(pendingWriteId: string): void {
    setConflict(null);
    commit.mutate(
      {
        tab,
        pendingWriteId,
        mutation: { operation: "add", content: draft.trim(), expectedVersion: store.version },
      },
      {
        onError: (error) => {
          if (error instanceof MemoryApiError && error.status === 409) {
            setConflict("Memory was changed by someone else. The canonical version is now shown; re-apply your change if still needed.");
          } else {
            setConflict("Approving the write failed. Try again.");
          }
        },
        onSuccess: () => setDraft(""),
      },
    );
  }

  return (
    <div>
      <p data-testid="usage-meter">
        <span aria-live="polite">
          {store.budget.used} / {store.budget.limit} characters
        </span>
        {overBudget ? <strong> over limit</strong> : null}
      </p>

      {conflict ? (
        <p role="alert">{conflict}</p>
      ) : null}

      <ul aria-label={`${tab === "agent" ? "Agent memory" : "User profile"} entries`}>
        {store.entries.length === 0 ? (
          <li>No memory entries yet.</li>
        ) : (
          store.entries.map((e) => (
            <li key={e.id}>
              <span>{e.content}</span>
              <span> · {e.origin === "automatic" ? "automatic" : "manual"}</span>
              <span> · updated {e.updatedAt}</span>
              <button onClick={() => setConfirmingRemoval(e)}>Remove</button>
            </li>
          ))
        )}
      </ul>

      <div>
        <label htmlFor="new-memory-content">New memory content</label>
        <input
          id="new-memory-content"
          value={draft}
          maxLength={MEMORY_MAX_CONTENT_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
        />
        {inputError ? <p role="alert">{inputError}</p> : null}
        <button onClick={stageAdd}>Stage add</button>
      </div>

      {store.pendingWrites.length > 0 ? (
        <div data-testid="pending-writes" aria-label="Pending writes">
          <h3>Pending writes</h3>
          <ul>
            {store.pendingWrites.map((p) => (
              <li key={p.id}>
                <span>{p.operation}</span>
                {p.content ? <span>: {p.content}</span> : null}
                <span> · {p.origin}</span>
                <button onClick={() => approve(p.id)}>Approve</button>
                <button
                  onClick={() =>
                    decide.mutate({ tab, pendingWriteId: p.id, action: "reject" })
                  }
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {confirmingRemoval ? (
        <div role="dialog" aria-label="Confirm removal">
          <p>Remove this memory entry? This cannot be undone.</p>
          <p>
            Remember: changes affect new sessions; existing sessions keep their snapshot.
          </p>
          <button
            onClick={() => {
              const target = confirmingRemoval;
              setConfirmingRemoval(null);
              commit.mutate(
                {
                  tab,
                  pendingWriteId: `remove-${target.id}`,
                  mutation: {
                    operation: "remove",
                    entryId: target.id,
                    expectedVersion: store.version,
                  },
                },
                {
                  onError: (error) => {
                    if (error instanceof MemoryApiError && error.status === 409) {
                      setConflict("Memory was changed by someone else. The canonical version is now shown.");
                    }
                  },
                },
              );
            }}
          >
            Confirm remove
          </button>
          <button onClick={() => setConfirmingRemoval(null)}>Cancel</button>
        </div>
      ) : null}
    </div>
  );
}
