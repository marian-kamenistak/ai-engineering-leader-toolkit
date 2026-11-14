/**
 * Run reporting for a cron-driven Worker: automation-kit contract v2 (REPORTING.md), through the CONTROL_ROOM service binding
 * (a same-account workers.dev fetch 404s). Pause flag first, then start, one event per step, one end report with the steps,
 * iterations, warnings and the deploy version. It only ever touches the scheduled handler: a live request never calls it.
 * Every call fails open: control-room being down or unwired never stops or slows the job beyond one short timeout.
 * REPORT_JOB_ID is test only (`wrangler deploy --var REPORT_JOB_ID:zz-...` reports under a zz- id, which control-room marks is_test).
 */
import { gate, report, startRun, type LiveRun, type ReportInput, type ReportOptions, type Status, type StepSummary } from "automation-kit/report";

export interface RunEnv {
	CONTROL_ROOM?: { fetch(input: string, init?: RequestInit): Promise<Response> };
	CONTROL_ROOM_TOKEN?: string;
	REPORT_JOB_ID?: string;
	CF_VERSION_METADATA?: { id?: string };
}

export interface TickConfig {
	/** The job id as in job.yaml, or the id reports are filed under when it differs (job.yaml report_ids). */
	jobId: string;
	host: string;
	runtime?: string;
}

export interface Tick {
	job: string;
	host: string;
	runtime: string;
	opts: ReportOptions | null;
	run_id: string;
	version?: string;
	/** True when this tick reports even if everything is green (the daily summary, a test id, a job that reports every run). */
	reporting: boolean;
	run: LiveRun | null;
	steps: StepSummary[];
	t0: number;
}

export function openTick(env: object, cfg: TickConfig, scheduledTime: number, reportWhen: (job: string) => boolean): Tick {
	const e = env as RunEnv;
	const job = e.REPORT_JOB_ID || cfg.jobId;
	const runtime = cfg.runtime ?? "worker";
	const run_id = `${job}:${scheduledTime}`;
	const opts: ReportOptions | null =
		e.CONTROL_ROOM && e.CONTROL_ROOM_TOKEN ? { binding: e.CONTROL_ROOM, token: e.CONTROL_ROOM_TOKEN, runtime, source: "worker", host: cfg.host, run_id } : null;
	return { job, host: cfg.host, runtime, opts, run_id, version: e.CF_VERSION_METADATA?.id, reporting: reportWhen(job), run: null, steps: [], t0: Date.now() };
}

/**
 * The pause flag (row 12) and upstream check (row 13), before any work. False means do nothing this tick: a paused or waiting run
 * is reported (not a failure) when this tick reports, and is silent otherwise.
 */
export async function gateTick(t: Tick, depends_on: string[] = []): Promise<boolean> {
	if (!t.opts) return true;
	const g = await gate(t.job, { depends_on }, t.opts);
	if (g.go) return true;
	if (t.reporting) await report({ job_id: t.job, run_id: t.run_id, status: g.status, detail: g.detail, runtime: t.runtime, source: "worker", host: t.host }, t.opts);
	return false;
}

/** Sends the start event when this tick reports (live "Running now" on the dashboard). */
export async function startTick(t: Tick): Promise<void> {
	if (t.opts && t.reporting) t.run = await startRun(t.job, t.opts);
}

/** One step: kept for the end report, and sent live when the run is live. */
export async function stepTick(t: Tick, step: StepSummary): Promise<void> {
	if (t.run) await t.run.step(step);
	else t.steps.push({ ...step, n: t.steps.length + 1 });
}

/**
 * The end report. A live run closes through its start event; a tick that was not live (a failure found on a quiet tick) sends the
 * end report alone with its steps summary, which control-room stores as the same audit log.
 * Returns whether control-room took it, so a caller that has a fallback alert knows when it needs one.
 */
export async function endTick(t: Tick, status: Status, fields: Partial<Omit<ReportInput, "job_id" | "status" | "run_id">> = {}): Promise<boolean> {
	if (!t.opts) return false;
	// Steps kept on the tick (a quiet tick, or a one- or two-step job that sends no live step events) ride in the end report.
	const body = { version: t.version, duration_s: (Date.now() - t.t0) / 1000, ...(t.steps.length ? { steps: t.steps } : {}), ...fields };
	const r = t.run
		? await t.run.end(status, body)
		: await report({ job_id: t.job, run_id: t.run_id, status, runtime: t.runtime, source: "worker", host: t.host, ...body }, t.opts);
	return r.ok;
}

/** True for the first tick after 00:00 UTC, for a cron that fires every `everyMin` minutes. */
export const isDailyTick = (scheduledTime: number, everyMin: number): boolean => scheduledTime % 86_400_000 < everyMin * 60_000;
