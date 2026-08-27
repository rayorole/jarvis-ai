import { createFileRoute } from "@tanstack/react-router";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { StatePattern } from "@jarvis/ui";
import { useChatRuntime } from "@/lib/chat-runtime";

/**
 * Streaming chat workspace. All SSE framing, event normalization, ordering,
 * abort, and cancel handling lives in `chat-runtime.ts`; this component only
 * renders already-validated message parts through assistant-ui primitives.
 */
function ChatWorkspace() {
  const { runtime, cancelActiveRun } = useChatRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div data-testid="chat-workspace" className="flex h-full flex-col">
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto" autoScroll>
            <ThreadPrimitive.Empty>
              <StatePattern
                kind="empty"
                title="No conversation open"
                detail="Start a new chat from the sidebar."
              />
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{
                UserMessage: () => (
                  <MessagePrimitive.Root data-testid="message-user">
                    <MessagePrimitive.Parts components={{ Text: TextPart }} />
                  </MessagePrimitive.Root>
                ),
                AssistantMessage: () => (
                  <MessagePrimitive.Root data-testid="message-assistant">
                    <MessagePrimitive.Parts components={{ Text: TextPart }} />
                  </MessagePrimitive.Root>
                ),
              }}
            />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
        <div className="border-t p-2" data-testid="chat-composer">
          <ComposerPrimitive.Root className="flex items-center gap-2">
            <ComposerPrimitive.Input
              aria-label="Message"
              placeholder="Message Jarvis…"
              rows={1}
              className="min-w-0 flex-1 resize-none"
            />
            <ComposerPrimitive.Send aria-label="Send message" />
            <button type="button" aria-label="Stop generating" onClick={cancelActiveRun}>
              ■
            </button>
          </ComposerPrimitive.Root>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

function TextPart({ text }: { text: string }) {
  return <span data-testid="message-text">{text}</span>;
}

export const Route = createFileRoute("/chat")({
  component: ChatWorkspace,
});
