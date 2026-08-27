import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { StatusDot } from "@jarvis/ui";
import { SessionHistoryPanel } from "../sessions/session-history";
import "../../styles/tokens.css";
import "../../styles/shell.css";

export type GatewayState = "online" | "degraded" | "offline" | "unknown";

export type ViewportMode = "desktop" | "tablet" | "mobile";

export interface SignalSegmentState {
  gateway?: boolean;
  generation?: boolean;
  approval?: boolean;
  background?: boolean;
  blocked?: boolean;
}

export interface AppShellProps {
  children: ReactNode;
  gatewayState?: GatewayState;
  generating?: boolean;
  pendingApprovals?: number;
  backgroundJobs?: number;
  blockedWork?: number;
  /** Route title shown in the sticky topbar. */
  title?: string;
}

const NAV_ITEMS = [
  { to: "/chat", label: "Chat", group: "Work" },
  { to: "/kanban", label: "Kanban", group: "Work" },
  { to: "/jobs", label: "Jobs", group: "Work" },
  { to: "/memory", label: "Memory", group: "System" },
  { to: "/files", label: "Files", group: "System" },
  { to: "/gateway", label: "Gateway", group: "System" },
  { to: "/settings", label: "Settings", group: "System" },
] as const;

const RAIL_SEGMENTS = [
  { kind: "gateway", label: "Gateway connection" },
  { kind: "generation", label: "Active generation" },
  { kind: "approval", label: "Pending approval" },
  { kind: "background", label: "Background activity" },
  { kind: "blocked", label: "Blocked work" },
] as const;

function useViewport(): ViewportMode {
  const [viewport, setViewport] = useState<ViewportMode>(() => computeViewport());
  useEffect(() => {
    const update = () => setViewport(computeViewport());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return viewport;
}

function computeViewport(): ViewportMode {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia("(max-width: 767px)").matches) return "mobile";
  if (window.matchMedia("(max-width: 1023px)").matches) return "tablet";
  return "desktop";
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export function AppShell({
  children,
  gatewayState = "unknown",
  generating = false,
  pendingApprovals = 0,
  backgroundJobs = 0,
  blockedWork = 0,
  title,
}: AppShellProps) {
  const viewport = useViewport();
  const reducedMotion = useReducedMotion();
  const isOverlay = viewport === "mobile";
  const [sheetOpen, setSheetOpen] = useState(false);

  // Reset the sheet when leaving mobile.
  useEffect(() => {
    if (!isOverlay) setSheetOpen(false);
  }, [isOverlay]);

  // Close the mobile sheet with Escape.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const segments: Record<string, boolean> = {
    gateway: gatewayState === "online",
    generation: generating,
    approval: pendingApprovals > 0,
    background: backgroundJobs > 0,
    blocked: blockedWork > 0,
  };

  return (
    <div className="app-shell safe-area-shell" data-viewport={viewport} data-testid="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside
        aria-label={isOverlay ? "Sidebar" : "Primary"}
        className="app-sidebar"
        data-state={isOverlay ? (sheetOpen ? "open" : "closed") : "open"}
        role="complementary"
      >
        {isOverlay ? (
          <button type="button" className="sheet-close" aria-label="Close navigation" onClick={() => setSheetOpen(false)}>
            &times;
          </button>
        ) : null}
        <WorkspaceIdentity gatewayState={gatewayState} />
        <div className="sidebar-section">
          <button type="button" className="new-chat-btn">
            New chat <kbd>&#8984;K</kbd>
          </button>
        </div>
        <div className="sidebar-section">
          <button type="button" aria-label="Search or open command palette">
            Search&#8230; / Command
          </button>
        </div>
        <NavGroups activePath={useLocation().pathname} />
        <RecentSessions />
        <SidebarFooter />
      </aside>

      <nav aria-label="Signal rail" className="signal-rail" role="complementary">
        {RAIL_SEGMENTS.map((s) => (
          <span
            key={s.kind}
            data-testid={`segment-${s.kind}`}
            className="signal-segment"
            data-kind={s.kind}
            data-active={segments[s.kind] ? "true" : "false"}
            data-motion={reducedMotion ? "none" : "full"}
            title={s.label}
            aria-label={`${s.label}: ${segments[s.kind] ? "active" : "idle"}`}
          />
        ))}
      </nav>

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header role="banner" className="app-topbar">
          {isOverlay ? (
            <button type="button" className="rail-toggle" aria-label="Open navigation" onClick={() => setSheetOpen(true)}>
              &#9776;
            </button>
          ) : null}
          <h1 className="route-title">{title ?? "Jarvis"}</h1>
          <div className="hud-cluster">
            <StatusDot state={gatewayState === "online" ? "online" : gatewayState} label={`Gateway ${gatewayState}`} />
          </div>
        </header>

        <main id="main-content" role="main" className="route-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function WorkspaceIdentity({ gatewayState }: { gatewayState: GatewayState }) {
  return (
    <div className="sidebar-section workspace-id">
      <strong>Jarvis</strong>
      <StatusDot
        className="gateway-status"
        state={gatewayState === "online" ? "online" : gatewayState}
        label={`Gateway ${gatewayState}`}
      />
    </div>
  );
}

function NavGroups({ activePath }: { activePath: string }) {
  const groups = ["Work", "System"] as const;
  return (
    <nav aria-label="Primary" style={{ display: "flex", flexDirection: "column", gap: "var(--space-block-default)" }}>
      {groups.map((group) => (
        <div key={group} className="sidebar-section">
          <p className="sidebar-heading" role="presentation">
            {group}
          </p>
          <ul className="recent-sessions" style={{ listStyle: "none", margin: 0, padding: 0, display: "contents" }}>
            {NAV_ITEMS.filter((i) => i.group === group).map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="nav-link" aria-current={activePath === item.to || (activePath === "/" && item.to === "/chat") ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Recent-sessions slot populated by the session history panel (issue #7). */
function RecentSessions() {
  return <SessionHistoryPanel />;
}

function SidebarFooter() {
  return (
    <div className="sidebar-section sidebar-footer">
      <button type="button">Appearance</button>
      <button type="button">Logout</button>
    </div>
  );
}
