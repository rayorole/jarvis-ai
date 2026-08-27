Query: You are the RESEARCH agent for project Jarvis AI (repo 
github.com/rayorole/jarvis-ai, freshly created README-only). Vision: a 
self-hosted web dashboard cloning Hermes Agent functionality with an entirely 
new UI.

MANDATED STACK: TanStack Start/Router/Query, Next-style serverless API routes 
proxying to gateway os.orole.be/v1/* (bearer key held server-side, same-origin 
/api/gateway/* pattern), assistant-ui (@assistant-ui/react) chat surface, 
shadcn/ui base, dnd-kit custom kanban board, sidebar layout shell. TDD via 
vitest + RTL.
AUTH: single secret passphrase login. Do NOT write any passphrase value anywhere
in your output. Specify: Argon2id hash+pepper, rate limiting, timing-safe 
compare, httpOnly SameSite=strict cookie session, CSRF.

DELIVERABLES (structured markdown, planner-ready):
A) Feature inventory cloned from Hermes Agent: read 
/data/.hermes/skills/autonomous-ai-agents/hermes-agent/SKILL.md plus references/
and fetch https://hermes-agent.nousresearch.com/docs/. Cover streaming chat 
sessions with history+resume, model/provider picker + fallback chain, tool 
approvals UI, cron/background jobs viewer, multi-agent kanban board, memory 
viewer, file explorer, gateway status, cost tickers, themes. For each module 
list required backend API data.
B) UI design spec grounded in real design patterns (research AI chat apps, 
Linear/Vercel dashboards on the web): sidebar anatomy, topbar, HUD aesthetic 
direction, chat message + approval-card rendering, kanban interaction patterns 
with dnd-kit.
C) Architecture proposal: repo structure (TanStack Start routes + api/*.ts 
serverless), TanStack Query state, SSE->assistant-ui streaming, testing strategy
(TDD).
Output ONLY the three deliverables. Be explicit about verified vs inferred 
claims.
Initializing agent...
────────────────────────────────────────

  ┊ 📚 skill     hermes-agent  0.5s
  ┊ 📚 skill     frontend-design  0.5s
  ┊ 📚 skill     defuddle  0.5s
  ┊ 📚 skill     grounded-citations  0.5s
  ┊ 📚 skill     vercel-react-best-practices  0.4s
  ┊ 📚 skill     tdd  0.4s
  ┊ 📚 skill     hermes-agent → references/security-privacy.md  0.4s
  ┊ 📚 skill     hermes-agent → references/providers-and-models.md  0.5s
  ┊ 📚 skill     hermes-agent → references/background-systems.md  0.4s
  ┊ 📚 skill     hermes-agent → references/themes.md  0.4s
  ┊ 📚 skill     hermes-agent → references/cli-reference.md  0.5s
  ┊ 📚 skill     hermes-agent → references/desktop-plugins.md  0.5s
  ┊ 💻 $         defuddle parse https://hermes-agent.nousresearch.com/docs/ --md -o /tmp/hermes-docs-index.md  0.6s
  ┊ 💻 $         python /data/.hermes/skills/research/grounded-citations/scripts/sources.py reset + 1 command  0.1s [exit 2]
  ┊ 📖 read      hermes-docs-index.md  0.1s
  ┊ 📚 skill     hermes-agent → references/configuration.md  0.1s
  ┊ 📚 skill     hermes-agent → references/slash-commands.md  0.1s
  ┊ 💻 $         python /data/.hermes/skills/research/grounded-citations/scripts/sources.py add https://hermes-agent.nousresearch.com/docs/ --title 'Hermes Agent Documentation' + 6 commands  0.4s
  ┊ 💻 $         defuddle parse https://linear.app/docs/design-principles --md -o /tmp/linear-design.md + 2 commands  2.4s
  ┊ 💻 $         defuddle parse https://tanstack.com/start/latest/docs/framework/react/overview --md -o /tmp/tanstack-start.md + 2 commands  2.0s
  ┊ 📖 read      vercel-design.md  0.1s
  ┊ 📖 read      assistant-ui.md  0.1s
  ┊ 📖 read      tanstack-start.md  0.1s
  ┊ 📖 read      tanstack-query.md  0.1s
  ┊ 📖 read      dndkit.md  0.1s
  ┊ 💻 $         defuddle parse https://linear.app/method --md -o /tmp/linear-method.md + 1 command  1.2s
  ┊ 💻 $         defuddle parse https://hermes-agent.nousresearch.com/docs/user-guide/features/memory --md -o /tmp/hermes-memory.md + 2 commands  2.8s
  ┊ 💻 $         defuddle parse https://hermes-agent.nousresearch.com/docs/developer-guide/architecture --md -o /tmp/hermes-architecture.md + 2 commands  3.6s
  ┊ 📖 read      linear-method.md  0.2s
  ┊ 📖 read      hermes-memory.md  0.2s
  ┊ 📖 read      hermes-cron.md  0.1s
  ┊ 📖 read      hermes-kanban.md  0.1s
  ┊ 📖 read      hermes-architecture.md  0.2s
  ┊ 📖 read      hermes-security.md  0.2s
  ┊ 📖 read      hermes-config.md  0.2s
  ┊ 💻 $         defuddle parse https://www.assistant-ui.com/docs/runtimes/custom/overview --md -o /tmp/assistant-custom.md + 2 commands  4.0s
  ┊ 💻 $         defuddle parse https://tanstack.com/start/latest/docs/framework/react/guide/server-routes --md -o /tmp/tanstack-server-routes.md + 1 command  1.4s [exit 1]
  ┊ 💻 $         defuddle parse https://docs.dndkit.com/react/guides/accessibility --md -o /tmp/dnd-accessibility.md + 2 commands  1.2s [exit 1]
  ┊ 💻 $         python /data/.hermes/skills/research/grounded-citations/scripts/sources.py add https://www.assistant-ui.com/docs/runtimes/custom/overview --title 'assistant-ui custom runtime' + 3 commands  0.3s
  ┊ 💻 $         curl -sS -o /tmp/jarvis-gateway-probe.txt -w '%{http_code}\n' https://os.orole.be/v1/  0.1s
  ┊ 📖 read      assistant-custom.md  0.1s
  ┊ 📖 read      assistant-tool-ui.md  0.1s
  ┊ 📖 read      assistant-thread.md  0.1s
  ┊ 📖 read      tanstack-server-routes.md  0.1s
  ┊ 📖 read      jarvis-gateway-probe.txt  0.1s
  ┊ 💻 $         python /data/.hermes/skills/research/grounded-citations/scripts/sources.py list  0.1s
  ┊ 💻 $         python /data/.hermes/skills/research/grounded-citations/scripts/sources.py add https://hermes-agent.nousresearch.com/docs/user-guide/features/memory --title 'Hermes memory' + 5 commands  0.4s
  ┊ 💻 $         python /data/.hermes/skills/research/grounded-citations/scripts/sources.py render --only 3,4,5,6,7,8,9,10,11,13,14,15,16,17,18  0.1s

╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
A) Feature inventory cloned from Hermes Agent

Evidence boundary

- Verified — Hermes capability: confirmed in the local Hermes skill and its references, then cross-checked against the official Hermes documentation.
- Verified — framework capability: confirmed in the relevant framework documentation.
- Inferred — Jarvis contract: proposed UI behavior, route names, and gateway payloads. The unauthenticated probe of https://os.orole.be/v1/ returned 404; therefore no concrete gateway OpenAPI schema or endpoint inventory was verified. The planner must treat all /v1/* resource names below as an adapter contract to reconcile with the real gateway.
- Security requirement: the browser must never receive the gateway bearer credential. Every browser request goes to same-origin /api/gateway/; the server route authenticates the Jarvis session, adds the bearer credential, and proxies to https://os.orole.be/v1/.

Module inventory

Module: 1. Streaming chat
Planner-ready behavior: Verified Hermes: persistent SQLite sessions, session
  lineage, FTS5 search, history loading, branching, resume/continue,
  cancellation, tool calls, and observable streaming execution are core Hermes
  behaviors.[16] Jarvis: thread list grouped by recency; search; create,
  rename, archive/delete; open an existing thread; resume generation; cancel;
  retry; branch from a message; copy/export; attachment indicators. Keep
  incomplete streams visibly resumable instead of pretending they finished.
Required backend/API data: SessionSummary { id, title, createdAt, updatedAt,
  model, provider, status, source, parentSessionId?, messageCount, tokenUsage?
  }; cursor-paginated session list and search; SessionDetail; ordered messages
  with stable IDs, roles, timestamps, content parts, tool parts, reasoning
  visibility, attachments, branch metadata, run status;
  create/rename/delete/resume/branch mutations; streaming run endpoint;
  cancellation endpoint. Inferred gateway mapping: GET /sessions, GET
  /sessions/:id, POST /sessions, PATCH /sessions/:id, DELETE /sessions/:id,
  POST /sessions/:id/runs, DELETE /runs/:runId.
────────────────────────────────────────
Module: 2. assistant-ui chat surface
Planner-ready behavior: Verified framework: assistant-ui’s Thread composes
  message rendering, scrolling, composer, suggestions, history, branching,
  send/cancel states, and overridable tool/reasoning groups.[4] Jarvis: use
  the primitives rather than building an independent message state machine.
  Assistant prose remains visually dominant; operational parts are structured
  secondary blocks.
Required backend/API data: Adapter-normalized message parts: text, reasoning,
  tool-call, tool-result, approval, attachment, error, and status. Stream
  events need stable sessionId, runId, messageId, monotonically increasing
  sequence, event type, and payload.
────────────────────────────────────────
Module: 3. Model/provider picker and fallback chain
Planner-ready behavior: Verified Hermes: users can select providers and
  models, use aliases, switch per session, rotate credential pools, and
  configure an ordered fallback chain.[18] Show the active pair in the chat
  topbar. Picker groups models by provider, searches by alias/name, marks
  unavailable credentials, and exposes context window and pricing only when
  the gateway supplies them. Fallback editor uses ordered rows with drag
  handles, validation, and an explicit “default for new sessions” action.
Required backend/API data: Provider { id, label, authState, enabled,
  baseUrlKind, health }; Model { id, providerId, label, alias[],
  contextWindow?, capabilities, inputPrice?, outputPrice?, enabled }; current
  global default; current session override; ordered FallbackEntry[];
  provider/model health and last failure; mutations to set session model,
  global default, add/remove/reorder fallback. Never expose credential values.
────────────────────────────────────────
Module: 4. Tool execution and approvals
Planner-ready behavior: Verified Hermes: command approvals support smart,
  manual, and off; dangerous operations can wait for human approval, time out
  fail-closed, or be denied, while an always-on catastrophic blocklist remains
  beneath approval settings.[17] Jarvis: render every tool call as a compact
  stateful row: queued → running → completed/failed. Expand to show sanitized
  arguments, elapsed time, output preview, and artifacts. Pending approvals
  become prominent approval cards with Approve once, Approve for session when
  supported, and Deny plus optional reason. Disable actions after the first
  accepted decision.
Required backend/API data: Tool events: toolCallId, tool name, display label,
  sanitized args, started/finished timestamps, progress, result preview,
  error, artifacts. Approval payload: approvalId, sessionId, runId, risk
  category, human explanation, sanitized command/action, cwd/target, allowed
  decisions, expiry, current state. Mutation: POST /approvals/:id/decision
  with one-time idempotency key and CSRF token. Server must reject stale,
  duplicate, or cross-session decisions.
────────────────────────────────────────
Module: 5. Cron and background jobs
Planner-ready behavior: Verified Hermes: cron supports recurring and one-shot
  schedules, pause/resume/edit/run/remove, skills, scripts, no-agent mode,
  delivery targets, model pins, run history, blocked configuration, failure
  streaks, incidents, and continuable deliveries.[14] Jarvis: split into Jobs,
  Runs, and Incidents tabs. The default table shows enabled state, next run,
  last result, model, delivery, and failure streak. A detail drawer shows
  immutable execution history and output. “Run now” is explicit and reports
  that it starts asynchronously.
Required backend/API data: CronJob including ID, name, schedule expression and
  human rendering, timezone, enabled state, prompt summary, skills,
  script/no-agent flags, workdir, model/provider pin, reasoning effort,
  delivery targets, next/last run, last status, failure streak, config-block
  reason, continuable flag. CronRun with claimed/running/terminal state,
  timestamps, output/error, usage/cost, delivery result. Incident with
  signature, state, occurrences, latest error. CRUD, run, pause/resume,
  incident acknowledge. Background-process feed: process ID, originating
  session/tool, status, startedAt, command label, exit state, log cursor.
────────────────────────────────────────
Module: 6. Multi-agent kanban
Planner-ready behavior: Verified Hermes: Kanban is a durable SQLite work
  queue, not ephemeral delegation. Tasks have statuses, dependencies,
  comments, profiles, workspaces, retries, events, attachments, review
  transitions, model overrides, and board isolation.[15] Jarvis: custom
  dnd-kit board with triage, todo, ready, running, blocked, review, done, plus
  optional archived. Include board switcher, search/filter, profile lanes,
  dependency progress, multi-select, create dialog, task drawer, comments,
  attachments, event history, model override, retry evidence, and dispatcher
  nudge.
Required backend/API data: Board; Task { id, boardId, title, body, status,
  priority, assignee, tenant?, skills[], workspace, modelOverride?, goalMode,
  createdAt, updatedAt, version }; parent/child IDs and completion counts;
  comments; attachments; latest events; run attempts; profiles with
  descriptions/availability; legal transition map; dispatcher status.
  Mutations for create/update/transition/reorder, assign, bulk actions,
  dependencies, comment, attach/remove file, request review/changes,
  block/unblock, and dispatcher nudge. Every mutation should accept
  expectedVersion for conflict detection.
────────────────────────────────────────
Module: 7. Memory viewer
Planner-ready behavior: Verified Hermes: built-in memory has separate
  MEMORY.md and USER.md stores with strict character budgets,
  frozen-at-session-start semantics, add/replace/remove operations, optional
  write approval, staged changes, session search, and a learning-journey
  view.[13] Jarvis: two tabs—Agent memory and User profile—with usage meters,
  entry list, provenance, edit/remove, pending-write review, and a clear
  warning that changes affect new sessions rather than an already-running
  prompt snapshot. Add a read-only “Learning journey” timeline later.
Required backend/API data: Store metadata: target, current characters, limit,
  enabled state, write-approval state. Entries: stable UI ID, content,
  source/provenance if available, updatedAt. Pending writes: ID, operation,
  target, old/new preview, auto/manual origin. Mutations add/replace/remove
  and approve/reject pending changes. Session-search endpoint remains separate
  from memory CRUD.
────────────────────────────────────────
Module: 8. File explorer
Planner-ready behavior: Verified Hermes: file operations and multiple terminal
  backends are core tools; Hermes also applies protected-path and optional
  safe-root rules to writes.[17] Jarvis: tree/list explorer scoped to
  server-approved roots, breadcrumbs, search, preview, download, upload,
  rename, create folder, and optional text edit. Never accept an arbitrary
  browser-supplied absolute path as authority. Show read-only/protected state
  before the user edits.
Required backend/API data: Root capabilities; opaque node IDs or root-relative
  canonical paths; FileNode { id, name, kind, size, modifiedAt, mime,
  permissions, protected, gitStatus? }; paginated directory listing; text
  preview with byte/range caps; download/upload; safe mutations. Backend
  canonicalizes paths, resolves symlinks, enforces roots after resolution,
  blocks secret/credential files, applies size limits, and logs mutations.
────────────────────────────────────────
Module: 9. Gateway status
Planner-ready behavior: Verified Hermes: the gateway owns session routing,
  platform adapters, authorization, cron ticking, background maintenance, and
  kanban dispatch.[16] Jarvis: overview cards for gateway reachability,
  authenticated upstream state, version, uptime, latency, active
  sessions/runs, scheduler, dispatcher, and connected platforms. Use explicit
  healthy, degraded, offline, and unknown states—never infer green from one
  successful page load.
Required backend/API data: GatewayStatus { status, version, uptime, checkedAt,
  latencyMs }; upstream auth-valid boolean without credential details;
  per-component health; platform adapter states; scheduler last/next tick;
  dispatcher last tick and queued/running counts; active stream count; recent
  redacted errors. A lightweight health endpoint should have a short timeout
  and no broad upstream payload.
────────────────────────────────────────
Module: 10. Usage and cost tickers
Planner-ready behavior: Verified Hermes: session status, usage, insights,
  model usage, and configurable cost display exist in Hermes. Jarvis: compact
  topbar HUD shows current context usage, current-run tokens, session cost,
  and daily/monthly totals. Clicking opens a breakdown by model/provider/task
  type; unknown pricing must display “unpriced,” not $0.00.
Required backend/API data: Per event/run/session: provider, model,
  prompt/input, cached input, completion/output, reasoning tokens where
  available, currency, computed cost, pricing-source timestamp. Aggregates by
  day/month/provider/model/task; account/provider quota or balance only when
  the upstream exposes it. Streaming usage events should update the ticker
  without refetching the entire session.
────────────────────────────────────────
Module: 11. Themes and appearance
Planner-ready behavior: Verified Hermes: semantic skins can coordinate
  backgrounds, text, borders, accents, tool/reasoning colors, status colors,
  diffs, and syntax across surfaces.[18] Jarvis: light, dark, and system modes
  plus named semantic themes. Persist per user/browser; expose density and
  reduced-motion preferences. Use semantic CSS variables, not feature-level
  hardcoded colors.
Required backend/API data: Theme manifest: ID, label, dark/light category,
  semantic token map, optional typography/density metadata. Active theme
  preference; list and select operations. If custom themes are supported
  later, validate contrast and token completeness server-side.
────────────────────────────────────────
Module: 12. Authentication and session security
Planner-ready behavior: Mandated Jarvis requirement, not a Hermes clone: one
  secret-passphrase login, with no user registration or password recovery
  flow. Store only an Argon2id hash, combine verification with a server-only
  pepper, rate-limit by normalized client/IP and global failure pressure, use
  generic failure responses, and normalize failure timing. Use timing-safe
  comparison for fixed-length session/CSRF token digests. Issue a
  cryptographically random opaque session in an httpOnly, Secure,
  SameSite=Strict cookie. Rotate it on login and privilege-sensitive events;
  store only its hash server-side; expire idle and absolute sessions. Require
  CSRF protection for every state-changing request, validate Origin/Host, and
  never put gateway credentials in HTML, client bundles, logs, query strings,
  or browser storage.
Required backend/API data: POST /api/auth/login, POST /api/auth/logout, GET
  /api/auth/session, and optionally GET /api/auth/csrf. Login returns only
  authenticated state and rate-limit-safe errors. Server-side session record:
  token digest, created/last-seen/expiry times, CSRF secret digest, revoked
  state, coarse audit metadata. Add strict security headers, request-size
  limits, redacted structured audit logs, and fail closed if the pepper, hash,
  or gateway credential is absent.

Recommended MVP sequencing

1. Authentication and server-only gateway proxy.
2. Gateway status plus provider/model discovery.
3. Session list, session detail, streaming chat, cancel/resume.
4. Tool rendering and approval decisions.
5. Kanban read-only board, then transitions and dnd-kit.
6. Cron/jobs viewer and lifecycle controls.
7. Memory viewer and safe file explorer.
8. Usage/cost analytics and theme editor.



B) UI design specification grounded in real patterns

1. Design principles and provenance

Verified patterns

- assistant-ui’s documented chat anatomy is a scrollable thread viewport, role-specific messages, conditional empty state, composer footer, scroll-to-bottom affordance, and send/cancel state switching.[4]
- assistant-ui supports grouped reasoning/tool parts, custom per-tool renderers, loading/error/result states, and human-interaction tools that resume after a user decision.[10]
- Linear’s published method emphasizes clear product direction, explicit issues, blocker visibility, scoped work, and momentum.[8] Jarvis should translate that into visible state, dependency, ownership, and next-action cues—not ornamental project-management chrome.
- Vercel describes its work as both “design systems” and “systemized designs,” grounded in the Geist system.[3] For Jarvis, the applicable pattern is a restrained token system, dense but consistent controls, and one shared visual grammar across chat, jobs, memory, and boards.
- dnd-kit provides drag, drop, sort, reorder, sensors, modifiers, and extensibility across layouts.[7]

Inferred synthesis

The exact Jarvis composition below is a proposal. It is not claimed to be an existing Linear, Vercel, Hermes, or assistant-ui screen.

2. Product aesthetic: “quiet operations cockpit”

Jarvis should look like a self-hosted agent control surface, not a generic SaaS analytics dashboard and not a neon sci-fi mock-up.

Signature element

A narrow signal rail runs immediately inside the main workspace edge. It visualizes the current operational state with semantic segments:

- gateway connection,
- active generation,
- pending approval,
- background activity,
- blocked work.

It is normally subdued. Only one segment gains color or motion when attention is required. This gives the “HUD” identity without filling every card with gradients, glows, or decorative telemetry.

Palette

| Token            | Dark value | Purpose                         |
|------------------|------------|---------------------------------|
| --surface-canvas | #0C1016    | Application canvas              |
| --surface-panel  | #121821    | Sidebar and primary panels      |
| --surface-raised | #18212C    | Drawers, menus, approval cards  |
| --stroke-subtle  | #273241    | Dividers and quiet borders      |
| --text-primary   | #E8EDF3    | Primary content                 |
| --text-secondary | #9BA9B8    | Metadata                        |
| --accent-signal  | #66A7FF    | Selection, focus, active stream |
| --status-success | #50B88A    | Healthy/completed               |
| --status-warning | #D7A84D    | Approval/attention              |
| --status-danger  | #E06C75    | Failed/blocked/destructive      |

Provide derived light equivalents through semantic variables. Do not encode status only by color: pair every state with text and an icon or shape.

Typography

- Interface/body: Geist Sans or a metrically compatible local sans.
- Operational data: Geist Mono for IDs, model aliases, durations, costs, paths, and timestamps.
- No oversized display type: the product’s identity comes from precision and live state, not landing-page typography.
- Default density: 14px body, 12px metadata, 16–18px page title. Keep line length for assistant prose near 70–78 characters.

Motion

- One restrained streaming pulse on the signal rail.
- Drag overlays use a short scale/shadow transition.
- Newly received tool events may fade in once.
- No ambient particle fields, constant glowing borders, or perpetual card motion.
- Respect prefers-reduced-motion; replace movement with state/color changes.

3. Application shell

text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Sidebar                         │ Topbar: context · model · usage · status   │
│                                 ├─ signal rail ──────────────────────────────┤
│ [New chat]                      │                                             │
│ Search / command                │              Route workspace                │
│                                 │                                             │
│ WORK                            │ Chat / Kanban / Cron / Memory / Files       │
│  Chat                           │                                             │
│  Kanban                         │                                             │
│  Jobs                           │                                             │
│                                 │                                             │
│ SYSTEM                          │                                             │
│  Memory                         │                                             │
│  Files                          │                                             │
│  Gateway                        │                                             │
│                                 │                                             │
│ Recent sessions                │                                             │
│                                 │                                             │
│ Profile · theme · logout        │                                             │
└──────────────────────────────────────────────────────────────────────────────┘


Sidebar anatomy

1. Workspace identity
   - Jarvis mark/name.
   - Active profile or gateway label.
   - Gateway status dot with accessible label.

2. Primary action
   - Full-width New chat button.
   - Keyboard shortcut shown in a <kbd> treatment.

3. Search / command entry
   - Opens a command palette.
   - Searches routes, sessions, tasks, jobs, and actions.
   - Recent actions appear before exhaustive navigation.

4. Primary navigation
   - Chat
   - Kanban
   - Jobs
   - Memory
   - Files
   - Gateway

5. Recent sessions
   - Maximum 5–8 visible.
   - Title, relative update time, active/running indicator.
   - Context menu: rename, duplicate/branch, archive/delete.

6. Footer
   - Active profile.
   - Appearance.
   - Keyboard shortcuts.
   - Logout.

Responsive behavior

- Desktop: 248px resizable sidebar.
- Tablet: icon rail plus temporary session drawer.
- Mobile: hidden sidebar opened as a sheet; topbar keeps page title, gateway state, and one overflow menu.
- Chat composer remains reachable above mobile safe-area insets.
- Kanban becomes horizontally scrollable by column; task editing remains a full-height sheet.

4. Topbar

Left cluster

- Current route or session title.
- Editable title on chat.
- Breadcrumbs only for files and nested settings; avoid redundant breadcrumbs elsewhere.

Center cluster

- Chat: model/provider picker.
- Kanban: board picker and filters.
- Jobs: status and schedule filters.
- Files: path breadcrumbs.

Right HUD

- Context usage ring or compact fraction.
- Current run tokens.
- Session cost.
- Gateway state.
- Active background process count.
- Pending approvals badge.

The topbar is sticky, 48–52px tall, and uses a bottom divider rather than a floating rounded container.

5. Chat surface

Thread layout

- Center column maximum width: approximately 880px.
- User and assistant messages align to the same reading grid.
- User messages use a lightly raised surface, not oversized speech bubbles.
- Assistant messages are mostly borderless prose.
- Markdown supports code, tables, citations, lists, and safe links.
- Show message timestamp and model only on hover/focus or in the action row.
- Long reasoning and tool sequences collapse into labeled groups.

Composer

- Sticky viewport footer.
- Multiline textarea with attachment button, tool/permission indicator, and send/cancel control.
- Footer metadata: selected model, effective fallback count, keyboard hint.
- While running, replace send with cancel; do not disable the composer if queued steering is supported.
- Failed submission keeps the draft intact.

Message action row

- Copy.
- Retry/regenerate.
- Branch from here.
- Edit and resend for user messages.
- Inspect raw event only behind a developer-mode toggle.

Streaming states

- Create the assistant message shell immediately.
- Append content parts incrementally.
- Keep tool and approval events ordered by stream sequence.
- If the stream disconnects, show: Connection interrupted — Resume.
- Never convert an interrupted run to completed merely because the SSE connection closed.

6. Tool and approval-card rendering

Ordinary tool card

text
┌─ Terminal · running ───────────────────────────── 02:14 ─┐
│ npm test                                                  │
│ Working directory: /workspace/jarvis-ai                   │
│ ▸ Show sanitized arguments                                │
│ ▾ Live output                                             │
└────────────────────────────────────────────────────────────┘


- Header: icon, human label, state, elapsed time.
- Body: sanitized intent before raw arguments.
- Running output is capped and virtualized; full logs open in a drawer.
- Completion shows a concise result plus artifacts.
- Error state gives a recovery action when one exists.

Approval card

text
┌─ Approval required · destructive command ────────────────┐
│ Delete generated build output in /workspace/dist.         │
│                                                          │
│ rm -rf ./dist                                             │
│                                                          │
│ Expires in 04:32                                          │
│ [Deny] [Approve once] [Approve for session]               │
└───────────────────────────────────────────────────────────┘


Rules:

- Warning color is concentrated on the card’s left rule and state icon.
- Human explanation precedes the raw command.
- Command/path uses monospace and is selectable.
- Deny is visually safe but not hidden; destructive approval is never the default focused action.
- Optional rejection reason appears after Deny.
- First accepted server response locks the card.
- Expired/stale approvals show an immutable terminal state.
- “Always approve” should be absent unless the upstream explicitly supports and audits it.

7. Kanban interaction specification

Board structure

- Column header: status dot, name, count, WIP warning, add button.
- Card: ID, title, priority, assignee avatar/initials, tenant, dependency progress, comment/attachment counts, updated time.
- Running can optionally split into per-profile swimlanes.
- Blocked cards show the first line of the block reason.
- Review cards distinguish “awaiting reviewer” from “changes requested.”

dnd-kit behavior

1. Use pointer, touch, and keyboard sensors.
2. Start pointer drag only after a small activation distance to preserve click-to-open.
3. Render a DragOverlay; leave a placeholder in the origin column.
4. Entire column bodies are droppable, including empty columns.
5. Calculate proposed status and insertion position locally.
6. Highlight illegal targets as unavailable rather than accepting and later surprising the user.
7. On drop:
   - optimistic move,
   - send taskId, destination status/index, and expectedVersion,
   - reconcile with canonical server order,
   - animate rollback and announce the error if rejected.
8. Moves to blocked, done, or archived open a confirmation/reason dialog when required by the transition.
9. Keyboard flow:
   - focus card,
   - lift,
   - move between positions/columns,
   - announce destination,
   - drop or cancel.
10. Use an ARIA live region to announce pickup, movement, successful drop, and rollback.
11. During active drag, live WebSocket updates should be buffered for the dragged task and reconciled after drop to avoid position jumps.

Non-drag alternatives

Every drag action must also be available through:

- card action menu,
- task drawer status selector,
- bulk action bar,
- keyboard commands.

Selection and task drawer

- Checkbox or modifier-click multi-select.
- Bulk bar: move, assign, archive, clear selection.
- Normal card click opens a right drawer.
- Drawer sections: overview, description, dependencies, comments, attachments, attempts, events.
- Keep task identity and status sticky at the drawer top.
- Deep-link the drawer state through route search params so refresh/back navigation works.

8. Empty, loading, error, and offline states

- Empty chat: concise capabilities and 3–4 real starter prompts.
- Empty board: explain how to create a task and what starts dispatch.
- No jobs: create-job CTA plus examples of accepted schedules.
- Gateway offline: preserve cached read-only data, disable mutations, and show the last successful check.
- Loading: skeleton only where layout is known; use a compact spinner for actions.
- Error: name the failed operation, preserve user input, and expose retry.
- Permission/auth expiry: route to login while retaining the intended local destination.



C) Architecture proposal

1. Architecture decisions

C1. Browser → Jarvis server → gateway only

text
Browser
  │ same-origin cookie + CSRF
  ▼
TanStack Start server routes
  ├── authenticate Jarvis session
  ├── authorize operation
  ├── validate/limit request
  ├── add server-held gateway bearer credential
  ├── proxy JSON/SSE to https://os.orole.be/v1/*
  └── redact/log outcome
        ▼
Hermes-compatible gateway


TanStack Start is a full-stack React framework with SSR, streaming, middleware, server functions, and server/API routes.[5] Its file-based server routes can live beside application routes and support middleware, dynamic paths, wildcard routes, and raw Request/Response handling.[11]

Hard rules:

- No direct browser requests to os.orole.be.
- No gateway credential in VITE_*, rendered HTML, client environment, local storage, cookies, logs, errors, or source maps.
- Allowlist proxied methods and path prefixes; do not implement an unrestricted open proxy.
- Strip hop-by-hop headers and any browser-provided Authorization.
- Construct the upstream URL from a fixed origin and validated path segments.
- Preserve upstream SSE streaming without buffering the entire response.
- Apply timeout, abort propagation, body-size limits, and redacted structured logging.
- Validate upstream content type before returning it.
- Map upstream errors to stable Jarvis error envelopes without reflecting sensitive bodies.

2. Proposed repository structure

text
jarvis-ai/
├── src/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── login.tsx
│   │   ├── _authenticated.tsx
│   │   ├── _authenticated.index.tsx
│   │   ├── _authenticated.chat.index.tsx
│   │   ├── _authenticated.chat.$sessionId.tsx
│   │   ├── _authenticated.kanban.tsx
│   │   ├── _authenticated.jobs.tsx
│   │   ├── _authenticated.memory.tsx
│   │   ├── _authenticated.files.tsx
│   │   ├── _authenticated.gateway.tsx
│   │   │
│   │   ├── api.auth.login.ts
│   │   ├── api.auth.logout.ts
│   │   ├── api.auth.session.ts
│   │   ├── api.auth.csrf.ts
│   │   ├── api.gateway.$.ts
│   │   └── api.health.ts
│   │
│   ├── components/
│   │   ├── app-shell/
│   │   │   ├── app-sidebar.tsx
│   │   │   ├── app-topbar.tsx
│   │   │   ├── command-palette.tsx
│   │   │   └── signal-rail.tsx
│   │   ├── assistant-ui/
│   │   │   ├── thread.tsx
│   │   │   ├── runtime-provider.tsx
│   │   │   ├── message-parts.tsx
│   │   │   ├── tool-group.tsx
│   │   │   └── approval-card.tsx
│   │   ├── kanban/
│   │   │   ├── board.tsx
│   │   │   ├── column.tsx
│   │   │   ├── task-card.tsx
│   │   │   ├── drag-overlay.tsx
│   │   │   ├── task-drawer.tsx
│   │   │   └── transition-dialog.tsx
│   │   ├── jobs/
│   │   ├── memory/
│   │   ├── files/
│   │   ├── gateway/
│   │   └── ui/                    # shadcn/ui-owned components
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth.server.ts
│   │   │   ├── session-store.server.ts
│   │   │   ├── csrf.server.ts
│   │   │   ├── rate-limit.server.ts
│   │   │   └── schemas.ts
│   │   ├── gateway/
│   │   │   ├── gateway-client.server.ts
│   │   │   ├── proxy-policy.server.ts
│   │   │   ├── contracts.ts
│   │   │   ├── normalizers.ts
│   │   │   └── errors.ts
│   │   ├── chat/
│   │   │   ├── api.ts
│   │   │   ├── queries.ts
│   │   │   ├── mutations.ts
│   │   │   ├── stream-client.ts
│   │   │   ├── stream-reducer.ts
│   │   │   └── contracts.ts
│   │   ├── models/
│   │   ├── approvals/
│   │   ├── kanban/
│   │   ├── jobs/
│   │   ├── memory/
│   │   ├── files/
│   │   ├── usage/
│   │   └── themes/
│   │
│   ├── lib/
│   │   ├── query-client.ts
│   │   ├── query-keys.ts
│   │   ├── env.server.ts
│   │   ├── logger.server.ts
│   │   ├── security-headers.server.ts
│   │   └── test/
│   │
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── themes.css
│   │   └── globals.css
│   ├── router.tsx
│   └── routeTree.gen.ts
│
├── tests/
│   ├── contracts/
│   ├── integration/
│   └── fixtures/
├── vitest.config.ts
├── components.json
└── package.json


api.gateway.$.ts is the TanStack Start wildcard equivalent of the mandated same-origin /api/gateway/* proxy. Thin purpose-built BFF endpoints may later replace portions of the catch-all where Jarvis needs aggregation or stronger authorization.

3. Gateway adapter contract

Because the real os.orole.be/v1/* schema was not verified, isolate it behind two layers:

text
gateway-client.server.ts
    raw upstream HTTP/SSE
            ↓
normalizers.ts
    upstream payload → Jarvis domain contracts
            ↓
queries/components/assistant-ui
    stable Jarvis types only


Required normalization boundaries

- upstream session → SessionSummary / SessionDetail;
- upstream event → JarvisStreamEvent;
- upstream tool invocation → assistant-ui tool part;
- upstream approval request → ApprovalRequest;
- upstream model/provider metadata → picker records;
- upstream task/job/memory/file/status records → module contracts;
- upstream error → JarvisApiError { code, message, retryable, requestId }.

Do not leak raw gateway payloads throughout components. That would make every screen depend on an unverified and potentially changing API.

4. TanStack Query state model

TanStack Query is designed for fetching, caching, synchronizing, invalidating, and updating remote server state.[6] Use it for canonical server state, not for every keystroke or drag pixel.

Query-key factory

ts
queryKeys.auth.session()
queryKeys.gateway.status()
queryKeys.providers.all()
queryKeys.models.all()
queryKeys.sessions.list(filters)
queryKeys.sessions.detail(sessionId)
queryKeys.kanban.boards()
queryKeys.kanban.tasks(boardId, filters)
queryKeys.kanban.task(boardId, taskId)
queryKeys.jobs.list(filters)
queryKeys.jobs.runs(jobId, cursor)
queryKeys.memory.store(target)
queryKeys.memory.pending()
queryKeys.files.directory(rootId, path)
queryKeys.usage.summary(range)


Cache policy

- Auth session: short stale time; clear all protected queries on logout.
- Gateway status: poll every 10–30 seconds, slower when the tab is hidden.
- Provider/model metadata: several-minute stale time.
- Session list: short stale time; update from stream/session events.
- Session detail: cache indefinitely while open; invalidate after terminal run state if the stream cannot supply canonical final data.
- Kanban: fetch current board and filters; apply WebSocket/SSE events by task ID.
- Jobs/runs: polling fallback plus event invalidation.
- Memory/files: fetch on route entry; invalidate only affected target/path after mutation.
- Usage: update from stream usage events and periodically reconcile with the server.

Optimistic mutation rules

Use optimistic updates for:

- session rename,
- kanban non-destructive status/reorder,
- task assignment/priority,
- job pause/resume,
- memory entry edits when the server contract is deterministic.

Do not optimistically finalize:

- approval decisions,
- task completion/archive,
- job removal,
- file deletion,
- logout,
- any mutation requiring upstream confirmation.

Every optimistic board mutation stores the previous cache snapshot and includes expectedVersion. A 409 restores the snapshot, refetches canonical state, and tells the user who or what changed the task.

5. SSE → assistant-ui streaming design

assistant-ui explicitly supports custom runtimes. Its documented choices include ExternalStoreRuntime for message state already held in TanStack Query and AssistantTransport for rich agent-state snapshots or bidirectional commands.[9]

Recommended first implementation

Use ExternalStoreRuntime plus a Jarvis stream adapter:

1. Load canonical session history with TanStack Query.
2. Provide assistant-ui the normalized message array and callbacks.
3. On send:
   - create an optimistic user message;
   - call same-origin /api/gateway/...;
   - open/read the proxied SSE response;
   - validate and sequence events;
   - reduce events into assistant-ui-compatible message parts.
4. Batch rapid text deltas with requestAnimationFrame or a small scheduler before updating the query cache.
5. Commit the canonical terminal message/run state after run.completed.
6. Abort the browser stream on cancel and propagate its AbortSignal through the server proxy to the gateway.
7. On reconnect, resume with runId plus the last accepted sequence/event ID when supported; otherwise refetch the session and expose an explicit resume action.

Event envelope

ts
type JarvisStreamEvent = {
  version: 1
  sequence: number
  eventId?: string
  sessionId: string
  runId: string
  messageId?: string
  type:
    | 'run.started'
    | 'message.started'
    | 'message.delta'
    | 'reasoning.delta'
    | 'tool.started'
    | 'tool.progress'
    | 'tool.completed'
    | 'tool.failed'
    | 'approval.requested'
    | 'approval.resolved'
    | 'usage.updated'
    | 'run.completed'
    | 'run.failed'
    | 'run.cancelled'
  payload: unknown
}


Stream invariants

- Ignore exact duplicate eventId values.
- Reject or buffer out-of-order sequences.
- Never execute tool logic in the browser merely because a stream event names a tool.
- Tool arguments/results are rendered after schema validation and sanitization.
- Approval cards are keyed by immutable approvalId.
- Only the approval mutation response may mark an approval resolved.
- Stream completion and transport closure are different states.
- Keep SSE headers uncompressed/unbuffered where the deployment runtime requires it.
- Emit periodic keepalives if intermediaries terminate idle streams.
- Test cancellation and disconnects against the actual deployment target, not only Vitest.

If the gateway later exposes full agent-state snapshots and resumable bidirectional commands, migrate the adapter boundary to assistant-ui AssistantTransport without changing the UI components.

6. Authentication and proxy security

Login verification

1. Apply request-body size and content-type limits.
2. Check rate-limit buckets before expensive hashing, but retain a bounded path that prevents trivial account-state timing differences.
3. Normalize the submitted value according to a documented policy.
4. Combine it with a server-only pepper.
5. Verify against the configured Argon2id hash.
6. Return one generic authentication error for every failure.
7. On success, rotate to a fresh opaque session and CSRF secret.

No secret value is checked into source, fixtures, snapshots, CI logs, or documentation.

Session cookie

Recommended attributes:

- httpOnly
- Secure
- SameSite=Strict
- Path=/
- host-only cookie; do not set a broad Domain
- bounded idle and absolute lifetime

Store only a digest of the opaque session token. Compare fixed-length token digests with a timing-safe primitive. Rotate on login; revoke on logout and expiry.

CSRF

Use a server-generated token bound to the authenticated session:

- expose it only after authentication;
- send it in a custom header for POST, PUT, PATCH, and DELETE;
- validate using a timing-safe comparison;
- validate Origin against the configured Jarvis origin;
- reject missing or malformed origin on browser mutations;
- keep SameSite=Strict as defense-in-depth, not the only control.

Rate limiting

At minimum:

- per-client/IP login bucket;
- global login pressure bucket;
- exponential or stepped cooldown;
- successful login does not expose whether previous attempts were close;
- proxy route limits by operation class;
- stricter limits for approval, file mutation, job run-now, and kanban dispatcher-nudge actions.

For horizontally scaled serverless deployment, rate-limit and session state require a shared atomic store. In-memory maps are acceptable only for a clearly documented single-instance self-hosted deployment.

7. TDD strategy with Vitest and React Testing Library

Public seams

The planner should lock these seams before implementation:

1. HTTP seam: browser-visible /api/auth/* and /api/gateway/*.
