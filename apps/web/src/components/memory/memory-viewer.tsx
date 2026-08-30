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
 * existing sessions keep the snapshot taken when they started.
 */
import { Fragment, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemoryStore, useStageMemoryMutation, useCommitMemoryMutation, useDecidePendingWriteMutation } from "@/lib/use-memory";
import { MEMORY_MAX_CONTENT_LENGTH, MemoryApiError, type MemoryEntry, type MemoryStore, type MemoryTab } from "@/lib/memory-api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
    <section aria-labelledby="memory-title" className="space-y-4">
      <h2 id="memory-title" className="text-lg font-semibold">Memory</h2>
      <Tabs value={tab} onValueChange={(v) => setTab(v as MemoryTab)}>
        <TabsList aria-label="Memory stores">
          <TabsTrigger value="agent">Agent memory</TabsTrigger>
          <TabsTrigger value="profile">User profile</TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="text-sm text-muted-foreground">
        Memory changes affect new sessions; existing sessions keep their
        snapshot from when they started.
      </p>
      {store.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-3" /> Loading memory…
        </p>
      ) : store.isError ? (
        <p role="alert" className="text-sm text-destructive">Could not load memory: {String(store.error)}</p>
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
    <div className="space-y-4">
      <p data-testid="usage-meter" className="text-sm text-muted-foreground">
        <span aria-live="polite">
          {store.budget.used} / {store.budget.limit} characters
        </span>
        {overBudget ? <strong className="text-destructive"> over limit</strong> : null}
      </p>

      {conflict ? (
        <p role="alert" className="text-sm text-destructive">{conflict}</p>
      ) : null}

      <ul aria-label={`${tab === "agent" ? "Agent memory" : "User profile"} entries`} className="space-y-2">
        {store.entries.length === 0 ? (
          <li className="text-sm text-muted-foreground">No memory entries yet.</li>
        ) : (
          store.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{e.content}</span>
              <Badge variant="outline">{e.origin === "automatic" ? "automatic" : "manual"}</Badge>
              <span className="text-xs text-muted-foreground">updated {e.updatedAt}</span>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmingRemoval(e)}>
                Remove
              </Button>
            </li>
          ))
        )}
      </ul>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="new-memory-content">New memory content</Label>
        <Input
          id="new-memory-content"
          value={draft}
          maxLength={MEMORY_MAX_CONTENT_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
        />
        {inputError ? <p role="alert" className="text-sm text-destructive">{inputError}</p> : null}
        <Button onClick={stageAdd} disabled={stage.isPending}>Stage add</Button>
      </div>

      {store.pendingWrites.length > 0 ? (
        <div data-testid="pending-writes" aria-label="Pending writes" className="space-y-2">
          <h3 className="font-medium">Pending writes</h3>
          <ul className="space-y-2">
            {store.pendingWrites.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <Badge variant="secondary">{p.operation}</Badge>
                {p.content ? <span className="min-w-0 flex-1 truncate">{p.content}</span> : <span className="flex-1" />}
                <span className="text-xs text-muted-foreground">{p.origin}</span>
                <Button size="sm" onClick={() => approve(p.id)}>Approve</Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    decide.mutate({ tab, pendingWriteId: p.id, action: "reject" })
                  }
                >
                  Reject
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AlertDialog open={confirmingRemoval !== null} onOpenChange={(open) => { if (!open) setConfirmingRemoval(null); }}>
        <AlertDialogContent role="dialog" aria-label="Confirm removal">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this memory entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Remember: changes affect new sessions; existing
              sessions keep their snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingRemoval(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirmingRemoval;
                setConfirmingRemoval(null);
                if (!target) return;
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
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
