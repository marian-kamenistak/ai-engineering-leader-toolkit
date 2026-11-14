/**
 * The sibling uptime probe, split out of index.ts so the pause gate, the retry and the run report can be tested.
 * Behaviour is the one index.ts had (probe the mentoring Worker every 15 min; report every failure plus one summary a day), plus the
 * operating standard (2026-11-14): the web pause flag is read first, each check gets one retry after a short backoff (a transient
 * network error is not an outage), and a reporting tick is a live v2 run: start, one step per check, end with iterations, errors and
 * the deploy version. control-room pages a failed run once per incident, so the webhook below is only the fallback for a report
 * control-room could not take.
 */
import { endTick, gateTick, isDailyTick, openTick, startTick, stepTick, type RunEnv } from "./run-report";

export const JOB_ID = "eng-leadership-toolkit";
const EVERY_MIN = 15;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UptimeCheck {
	name: string;
	run: () => Promise<boolean>;
}

export async function uptimeTick(
	env: RunEnv,
	scheduledTime: number,
	ctx: { waitUntil(p: Promise<unknown>): void },
	checks: UptimeCheck[],
	fallbackAlert: (failures: string[]) => Promise<void>,
	retryDelayMs = 400,
): Promise<{ paused?: boolean; failures: string[]; delivered: boolean }> {
	// The daily summary is the first tick after 00:00 UTC; a zz- REPORT_JOB_ID (test only) reports every tick.
	const t = openTick(env, { jobId: JOB_ID, host: JOB_ID }, scheduledTime, (job) => isDailyTick(scheduledTime, EVERY_MIN) || job.startsWith("zz-"));
	if (!(await gateTick(t))) return { paused: true, failures: [], delivered: false };
	await startTick(t);

	const failures: string[] = [];
	for (const c of checks) {
		const t1 = Date.now();
		let why = "";
		const attempt = async () => {
			try {
				return await c.run();
			} catch (e) {
				why = ` (${String(e).slice(0, 80)})`;
				return false;
			}
		};
		// One retry, after a short backoff: both checks are idempotent (a GET and an MCP initialize).
		const ok = (await attempt()) || (await pause(retryDelayMs).then(attempt));
		const failed = ok ? null : `${c.name}${why}`;
		if (failed) failures.push(failed);
		await stepTick(t, { name: c.name, items_in: 1, items_out: ok ? 1 : 0, duration_s: (Date.now() - t1) / 1000, warnings: failed ? [failed] : [] });
	}
	const summary = { iterations: checks.length, kpi: `${checks.length - failures.length}/${checks.length} mentoring MCP uptime checks ok` };

	if (!failures.length) {
		if (t.reporting) ctx.waitUntil(endTick(t, "success", { ...summary, kpi_pass: "yes", exit_code: 0, detail: "daily summary: sibling uptime probe every 15 min" }));
		return { failures, delivered: true };
	}
	console.error("[UPTIME_FAIL]", failures);
	const delivered = await endTick(t, "failed", { ...summary, kpi_pass: "no", exit_code: 1, detail: failures.join(" · ").slice(0, 1000), errors: failures });
	if (!delivered) await fallbackAlert(failures);
	return { failures, delivered };
}
