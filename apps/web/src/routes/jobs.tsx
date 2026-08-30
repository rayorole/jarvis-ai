import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { StatePattern, StatusDot, Panel } from "@jarvis/ui";
import { useIncidents, useJobAction, useJobs, useOptimisticToggle, useProcesses, useRuns } from "@/hooks/useJobs";
import { formatSchedule, type JarvisIncident, type JarvisJob, type JarvisRun, type JobsTab } from "@/lib/jobs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const TABS: readonly JobsTab[] = ["jobs", "runs", "processes", "incidents"] as const;

export const Route = createFileRoute("/jobs")({
  component: JobsRoute,
});

function JobsRoute() {
  const [tab, setTab] = useState<JobsTab>("jobs");
  return (
    <section aria-labelledby="jobs-title" className="space-y-4">
      <h1 id="jobs-title" className="text-lg font-semibold">Jobs</h1>
      <Tabs value={tab} onValueChange={(v) => setTab(v as JobsTab)}>
        <TabsList aria-label="Jobs views">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`tab-${t}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
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
      <div className="flex items-center gap-2">
        <Label htmlFor="job-state-filter">Filter by state</Label>
        <Select value={jobFilter} onValueChange={(v) => setJobFilter(v)}>
          <SelectTrigger id="job-state-filter" className="w-40" aria-label="Filter by state">
            <SelectValue placeholder="all" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="queued">queued</SelectItem>
            <SelectItem value="claimed">claimed</SelectItem>
            <SelectItem value="running">running</SelectItem>
            <SelectItem value="paused">paused</SelectItem>
            <SelectItem value="blocked">blocked</SelectItem>
            <SelectItem value="terminal">terminal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ul aria-label="Jobs" data-testid="jobs-list" className="space-y-3">
        {filtered.map((job) => (
          <li key={job.id} data-testid={`job-${job.id}`}>
            <Panel>
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => setSelected(selected?.id === job.id ? null : job)} aria-expanded={selected?.id === job.id}>
                  {job.name}
                </Button>
                <StatusDot state={stateToStatus(job)} label={job.state} />
              </div>
              <p data-testid={`schedule-${job.id}`} className="text-sm text-muted-foreground">
                <span aria-hidden="true">🕒</span> {formatSchedule(job.schedule, job.timezone)} <span className="sr-only">(canonical schedule {job.schedule}, timezone {job.timezone})</span>
              </p>
              <p className="text-sm">Next run: {formatDate(job.nextRunAt)}</p>
              <p className="text-sm">Last run: {formatDate(job.lastRunAt)}</p>
              <p className="text-sm text-muted-foreground">
                {job.model} / {job.provider} · failures: {job.failureStreak} · delivery: {job.deliveryTarget || "none"}
              </p>
              {job.blockedReason ? <p role="note" className="text-sm text-amber-400">Blocked: {job.blockedReason}</p> : null}
              {selected?.id === job.id && <JobDetail job={job} />}
              <div className="mt-2 flex gap-2">
                {job.enabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`pause-${job.id}`}
                    onClick={() =>
                      toggle.mutate({ jobId: job.id, action: "pause" })
                    }
                  >
                    Pause
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`resume-${job.id}`}
                    onClick={() =>
                      toggle.mutate({ jobId: job.id, action: "resume" })
                    }
                  >
                    Resume
                  </Button>
                )}
                <Button variant="secondary" size="sm" data-testid={`run-now-${job.id}`} onClick={() => runAction.mutate({ jobId: job.id, action: "run-now" })}>
                  Run now
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  data-testid={`remove-${job.id}`}
                  onClick={() => {
                    if (window.confirm(`Remove job "${job.name}"? This cannot be undone.`)) {
                      runAction.mutate({ jobId: job.id, action: "remove" });
                    }
                  }}
                >
                  Remove
                </Button>
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
    <dl aria-label={`${job.name} details`} data-testid={`detail-${job.id}`} className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border p-3 text-sm">
      <dt className="text-muted-foreground">Schedule (canonical)</dt>
      <dd>
        <code>{job.schedule}</code>
      </dd>
      <dt className="text-muted-foreground">Timezone</dt>
      <dd>{job.timezone}</dd>
      <dt className="text-muted-foreground">Model pin</dt>
      <dd>
        {job.model} / {job.provider}
      </dd>
      <dt className="text-muted-foreground">Delivery target</dt>
      <dd>{job.deliveryTarget || "none"}</dd>
      <dt className="text-muted-foreground">Failure streak</dt>
      <dd>{job.failureStreak}</dd>
      {job.blockedReason ? (
        <>
          <dt className="text-muted-foreground">Blocked reason</dt>
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
    return runFilter && runFilter !== "all" ? runs.filter((r) => r.state === runFilter) : runs;
  }, [runs, runFilter]);

  if (isPending) return <StatePattern kind="loading" title="Loading runs" />;
  if (isError) return <StatePattern kind="error" title="Could not load runs" detail={error instanceof Error ? error.message : undefined} retry={() => void refetch()} />;
  if (filtered.length === 0) return <StatePattern kind="empty" title="No runs recorded" />;

  return (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="run-state-filter">Filter by state</Label>
        <Select value={runFilter} onValueChange={(v) => setRunFilter(v)}>
          <SelectTrigger id="run-state-filter" className="w-40" aria-label="Filter by state">
            <SelectValue placeholder="all" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="queued">queued</SelectItem>
            <SelectItem value="claimed">claimed</SelectItem>
            <SelectItem value="running">running</SelectItem>
            <SelectItem value="succeeded">succeeded</SelectItem>
            <SelectItem value="failed">failed</SelectItem>
            <SelectItem value="cancelled">cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ul aria-label="Runs" data-testid="runs-list" className="space-y-3">
        {filtered.map((run) => (
          <li key={run.id} data-testid={`run-${run.id}`}>
            <Panel>
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => setSelected(selected?.id === run.id ? null : run)} aria-expanded={selected?.id === run.id}>
                  Run {run.id} — {run.state}
                </Button>
                <StatusDot state={runStateToStatus(run)} label={run.state} />
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(run.startedAt)} → {formatDate(run.finishedAt)}
              </p>
              <p className="text-sm">
                tokens: {run.usage.inputTokens} in / {run.usage.outputTokens} out · ${run.costUsd.toFixed(4)}
              </p>
              {run.continuable ? <Badge variant="secondary">Can be continued</Badge> : null}
              {selected?.id === run.id ? (
                <div data-testid={`run-detail-${run.id}`} aria-label={`Run ${run.id} output`} className="mt-2 space-y-1 rounded-md border p-3">
                  {run.output ? <pre data-testid={`run-output-${run.id}`} className="overflow-x-auto rounded bg-muted p-2 text-xs">{run.output}</pre> : <p className="text-sm text-muted-foreground">No output captured.</p>}
                  {run.error ? (
                    <p role="alert" className="text-sm text-destructive">
                      Error: {run.error}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">Delivery: {run.deliveryResult || "none"}</p>
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
    <ul aria-label="Background processes" data-testid="processes-list" className="space-y-3">
      {processes.map((p) => (
        <li key={p.id} data-testid={`process-${p.id}`}>
          <Panel>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{p.name}</h3>
              <StatusDot state={p.state === "running" ? "online" : p.state === "exited" ? "offline" : "unknown"} label={p.state} />
            </div>
            <p className="text-sm text-muted-foreground">pid {p.pid}</p>
            <p className="text-sm text-muted-foreground">Started: {formatDate(p.startedAt)}</p>
            <p className="text-sm">{p.summary || "no summary available"}</p>
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
    <ul aria-label="Incidents" data-testid="incidents-list" className="space-y-3">
      {incidents.map((i) => (
        <li key={i.id} data-testid={`incident-${i.id}`}>
          <Panel>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{i.title}</h3>
              <StatusDot state={i.severity === "critical" ? "danger" : i.severity === "warning" ? "warning" : "neutral"} label={i.severity} />
            </div>
            <p className="text-sm text-muted-foreground">Opened: {formatDate(i.openedAt)}</p>
            {i.jobId ? <p className="text-sm text-muted-foreground">Job: {i.jobId}</p> : null}
            {i.acknowledged ? <Badge variant="outline">Acknowledged</Badge> : (
              <Button variant="outline" size="sm" data-testid={`ack-${i.id}`} onClick={() => runAction.mutate({ jobId: i.id, action: "acknowledge" })}>
                Acknowledge
              </Button>
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
