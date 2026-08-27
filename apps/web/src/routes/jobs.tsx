import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { StatePattern, StatusDot, Panel } from "@jarvis/ui";
import { useIncidents, useJobAction, useJobs, useOptimisticToggle, useProcesses, useRuns } from "@/hooks/useJobs";
import { formatSchedule, type JarvisIncident, type JarvisJob, type JarvisRun, type JobsTab } from "@/lib/jobs";

const TABS: readonly JobsTab[] = ["jobs", "runs", "processes", "incidents"] as const;

export const Route = createFileRoute("/jobs")({
  component: JobsRoute,
});

function JobsRoute() {
  const [tab, setTab] = useState<JobsTab>("jobs");
  return (
    <section aria-labelledby="jobs-title">
      <h1 id="jobs-title">Jobs</h1>
      <div role="tablist" aria-label="Jobs views">
        {TABS.map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "jobs" && <JobsList />}
      {tab === "runs" && <RunsList />}
      {tab === "processes" && <ProcessList />}
      {tab === "incidents" && <IncidentList />}
    </section>
  );
}

function JobsList() {
  const { data: jobs, isPending, isError, error, refetch } = useJobs();
  const [jobFilter, setJobFilter] = useState("");
  const [selected, setSelected] = useState<JarvisJob | null>(null);
  const runAction = useJobAction();
  const toggle = useOptimisticToggle();

  const filtered = useMemo(() => {
    if (!jobs) return [];
    return jobFilter ? jobs.filter((j) => j.state === jobFilter) : jobs;
  }, [jobs, jobFilter]);

  if (isPending) return <StatePattern kind="loading" title="Loading jobs" />;
  if (isError) return <StatePattern kind="error" title="Could not load jobs" detail={error instanceof Error ? error.message : undefined} retry={() => void refetch()} />;
  if (filtered.length === 0) return <StatePattern kind="empty" title={jobFilter ? `No ${jobFilter} jobs` : "No jobs configured"} detail="Scheduled jobs appear here once the gateway reports them." />;

  return (
    <>
      <label htmlFor="job-state-filter">Filter by state</label>
      <select id="job-state-filter" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
        <option value="">all</option>
        <option value="queued">queued</option>
        <option value="claimed">claimed</option>
        <option value="running">running</option>
        <option value="paused">paused</option>
        <option value="blocked">blocked</option>
        <option value="terminal">terminal</option>
      </select>
      <ul aria-label="Jobs" data-testid="jobs-list">
        {filtered.map((job) => (
          <li key={job.id} data-testid={`job-${job.id}`}>
            <Panel>
              <h3>
                <button type="button" onClick={() => setSelected(selected?.id === job.id ? null : job)} aria-expanded={selected?.id === job.id}>
                  {job.name}
                </button>
              </h3>
              <StatusDot state={stateToStatus(job)} label={job.state} />
              <p data-testid={`schedule-${job.id}`}>
                <span aria-hidden="true">🕒</span> {formatSchedule(job.schedule, job.timezone)} <span className="sr-only">(canonical schedule {job.schedule}, timezone {job.timezone})</span>
              </p>
              <p>Next run: {formatDate(job.nextRunAt)}</p>
              <p>Last run: {formatDate(job.lastRunAt)}</p>
              <p>
                {job.model} / {job.provider} · failures: {job.failureStreak} · delivery: {job.deliveryTarget || "none"}
              </p>
              {job.blockedReason ? <p role="note">Blocked: {job.blockedReason}</p> : null}
              {selected?.id === job.id && <JobDetail job={job} />}
              <div>
                {job.enabled ? (
                  <button
                    type="button"
                    data-testid={`pause-${job.id}`}
                    onClick={() =>
                      toggle.mutate({ jobId: job.id, action: "pause" })
                    }
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`resume-${job.id}`}
                    onClick={() =>
                      toggle.mutate({ jobId: job.id, action: "resume" })
                    }
                  >
                    Resume
                  </button>
                )}
                <button type="button" data-testid={`run-now-${job.id}`} onClick={() => runAction.mutate({ jobId: job.id, action: "run-now" })}>
                  Run now
                </button>
                <button
                  type="button"
                  data-testid={`remove-${job.id}`}
                  onClick={() => {
                    if (window.confirm(`Remove job "${job.name}"? This cannot be undone.`)) {
                      runAction.mutate({ jobId: job.id, action: "remove" });
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </>
  );
}

function JobDetail({ job }: { job: JarvisJob }) {
  return (
    <dl aria-label={`${job.name} details`} data-testid={`detail-${job.id}`}>
      <dt>Schedule (canonical)</dt>
      <dd>
        <code>{job.schedule}</code>
      </dd>
      <dt>Timezone</dt>
      <dd>{job.timezone}</dd>
      <dt>Model pin</dt>
      <dd>
        {job.model} / {job.provider}
      </dd>
      <dt>Delivery target</dt>
      <dd>{job.deliveryTarget || "none"}</dd>
      <dt>Failure streak</dt>
      <dd>{job.failureStreak}</dd>
      {job.blockedReason ? (
        <>
          <dt>Blocked reason</dt>
          <dd>{job.blockedReason}</dd>
        </>
      ) : null}
    </dl>
  );
}

function RunsList() {
  const { data: runs, isPending, isError, error, refetch } = useRuns();
  const [selected, setSelected] = useState<JarvisRun | null>(null);
  const [runFilter, setRunFilter] = useState("");

  const filtered = useMemo(() => {
    if (!runs) return [];
    return runFilter ? runs.filter((r) => r.state === runFilter) : runs;
  }, [runs, runFilter]);

  if (isPending) return <StatePattern kind="loading" title="Loading runs" />;
  if (isError) return <StatePattern kind="error" title="Could not load runs" detail={error instanceof Error ? error.message : undefined} retry={() => void refetch()} />;
  if (filtered.length === 0) return <StatePattern kind="empty" title="No runs recorded" />;

  return (
    <>
      <label htmlFor="run-state-filter">Filter by state</label>
      <select id="run-state-filter" value={runFilter} onChange={(e) => setRunFilter(e.target.value)}>
        <option value="">all</option>
        <option value="queued">queued</option>
        <option value="claimed">claimed</option>
        <option value="running">running</option>
        <option value="succeeded">succeeded</option>
        <option value="failed">failed</option>
        <option value="cancelled">cancelled</option>
      </select>
      <ul aria-label="Runs" data-testid="runs-list">
        {filtered.map((run) => (
          <li key={run.id} data-testid={`run-${run.id}`}>
            <Panel>
              <button type="button" onClick={() => setSelected(selected?.id === run.id ? null : run)} aria-expanded={selected?.id === run.id}>
                Run {run.id} — {run.state}
              </button>
              <StatusDot state={runStateToStatus(run)} label={run.state} />
              <p>
                {formatDate(run.startedAt)} → {formatDate(run.finishedAt)}
              </p>
              <p>
                tokens: {run.usage.inputTokens} in / {run.usage.outputTokens} out · ${run.costUsd.toFixed(4)}
              </p>
              {run.continuable ? <p>Can be continued.</p> : null}
              {selected?.id === run.id ? (
                <div data-testid={`run-detail-${run.id}`} aria-label={`Run ${run.id} output`}>
                  {run.output ? <pre data-testid={`run-output-${run.id}`}>{run.output}</pre> : <p>No output captured.</p>}
                  {run.error ? (
                    <p role="alert">
                      Error: {run.error}
                    </p>
                  ) : null}
                  <p>Delivery: {run.deliveryResult || "none"}</p>
                </div>
              ) : null}
            </Panel>
          </li>
        ))}
      </ul>
    </>
  );
}

function ProcessList() {
  const { data: processes, isPending, isError, error, refetch } = useProcesses();
  if (isPending) return <StatePattern kind="loading" title="Loading background processes" />;
  if (isError) return <StatePattern kind="error" title="Could not load background processes" detail={error instanceof Error ? error.message : undefined} retry={() => void refetch()} />;
  if (!processes || processes.length === 0) return <StatePattern kind="empty" title="No background processes" />;

  return (
    <ul aria-label="Background processes" data-testid="processes-list">
      {processes.map((p) => (
        <li key={p.id} data-testid={`process-${p.id}`}>
          <Panel>
            <h3>{p.name}</h3>
            <StatusDot state={p.state === "running" ? "online" : p.state === "exited" ? "offline" : "unknown"} label={p.state} />
            <p>pid {p.pid}</p>
            <p>Started: {formatDate(p.startedAt)}</p>
            <p>{p.summary || "no summary available"}</p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}

function IncidentList() {
  const { data: incidents, isPending, isError, error, refetch } = useIncidents();
  const runAction = useJobAction();
  if (isPending) return <StatePattern kind="loading" title="Loading incidents" />;
  if (isError) return <StatePattern kind="error" title="Could not load incidents" detail={error instanceof Error ? error.message : undefined} retry={() => void refetch()} />;
  if (!incidents || incidents.length === 0) return <StatePattern kind="empty" title="No incidents" detail="Unresolved incidents appear here." />;

  return (
    <ul aria-label="Incidents" data-testid="incidents-list">
      {incidents.map((i) => (
        <li key={i.id} data-testid={`incident-${i.id}`}>
          <Panel>
            <h3>{i.title}</h3>
            <StatusDot state={i.severity === "critical" ? "danger" : i.severity === "warning" ? "warning" : "neutral"} label={i.severity} />
            <p>Opened: {formatDate(i.openedAt)}</p>
            {i.jobId ? <p>Job: {i.jobId}</p> : null}
            {i.acknowledged ? <p>Acknowledged.</p> : (
              <button type="button" data-testid={`ack-${i.id}`} onClick={() => runAction.mutate({ jobId: i.id, action: "acknowledge" })}>
                Acknowledge
              </button>
            )}
          </Panel>
        </li>
      ))}
    </ul>
  );
}

function stateToStatus(job: JarvisJob) {
  switch (job.state) {
    case "running":
    case "claimed":
      return "online" as const;
    case "paused":
      return "warning" as const;
    case "blocked":
      return "danger" as const;
    case "terminal":
      return "success" as const;
    default:
      return "unknown" as const;
  }
}

function runStateToStatus(run: JarvisRun) {
  switch (run.state) {
    case "running":
      return "online" as const;
    case "succeeded":
      return "success" as const;
    case "failed":
      return "danger" as const;
    case "cancelled":
      return "warning" as const;
    default:
      return "unknown" as const;
  }
}

function formatDate(iso: string): string {
  if (!iso || iso.startsWith("1970-01-01")) return "—";
  return new Date(iso).toLocaleString();
}