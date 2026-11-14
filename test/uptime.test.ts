import { describe, expect, it } from "vitest";
import { uptimeTick, type UptimeCheck } from "../src/uptime";
import type { RunEnv } from "../src/run-report";

const DAILY = Date.UTC(2026, 10, 14, 0, 0); // first tick after 00:00 UTC
const QUIET = Date.UTC(2026, 10, 14, 10, 15);

function fakeControlRoom(opts: { pause?: { by: string; why: string }; reportStatus?: number } = {}) {
	const calls: { method: string; path: string; body: any }[] = [];
	return {
		calls,
		binding: {
			fetch: async (u: string, init: RequestInit = {}) => {
				const path = new URL(u).pathname;
				calls.push({ method: init.method ?? "GET", path, body: init.body ? JSON.parse(String(init.body)) : null });
				if (path.startsWith("/api/pause/")) return new Response(JSON.stringify({ ok: true, paused: !!opts.pause, ...opts.pause }), { status: 200 });
				return new Response("{}", { status: opts.reportStatus ?? 202 });
			},
		},
		posts: () => calls.filter((c) => c.method === "POST").map((c) => c.body),
	};
}
const ctx = () => { const p: Promise<unknown>[] = []; return { waitUntil: (x: Promise<unknown>) => void p.push(x), done: () => Promise.all(p) }; };
const ok = (name: string): UptimeCheck => ({ name, run: async () => true });
const bad = (name: string): UptimeCheck => ({ name, run: async () => false });
const mkEnv = (cr: ReturnType<typeof fakeControlRoom>, extra = {}) =>
	({ CONTROL_ROOM: cr.binding, CONTROL_ROOM_TOKEN: "t", CF_VERSION_METADATA: { id: "ver-1" }, ...extra }) as unknown as RunEnv;

describe("uptimeTick (operating standard v2)", () => {
	it("daily green tick: pause check, start, a step per check, one end report with iterations and the deploy version", async () => {
		const cr = fakeControlRoom(); const c = ctx(); let alerts = 0;
		const r = await uptimeTick(mkEnv(cr), DAILY, c, [ok("a"), ok("b")], async () => void alerts++, 0);
		await c.done();
		expect(r.failures).toEqual([]);
		expect(cr.calls[0].path).toBe("/api/pause/eng-leadership-toolkit");
		expect(cr.posts().map((b) => b.event ?? "end")).toEqual(["start", "step", "step", "end"]);
		expect(cr.posts().at(-1)).toMatchObject({ job_id: "eng-leadership-toolkit", status: "success", iterations: 2, version: "ver-1", kpi_pass: "yes", runtime: "worker" });
		expect(alerts).toBe(0);
	});

	it("a green tick outside the daily summary reports nothing", async () => {
		const cr = fakeControlRoom(); const c = ctx();
		await uptimeTick(mkEnv(cr), QUIET, c, [ok("a")], async () => {}, 0);
		await c.done();
		expect(cr.posts()).toEqual([]);
	});

	it("gate path: paused from the web probes nothing and reports paused (not a failure) on a reporting tick", async () => {
		const cr = fakeControlRoom({ pause: { by: "marian@kamenistak.com", why: "planned deploy" } }); const c = ctx(); let ran = 0;
		const r = await uptimeTick(mkEnv(cr), DAILY, c, [{ name: "a", run: async () => (ran++, false) }], async () => {}, 0);
		await c.done();
		expect(r.paused).toBe(true); expect(ran).toBe(0);
		expect(cr.posts()).toHaveLength(1);
		expect(cr.posts()[0]).toMatchObject({ status: "paused" });
		expect(cr.posts()[0].detail).toMatch(/paused by marian: planned deploy/);
	});

	it("gate path: paused on a quiet tick is silent", async () => {
		const cr = fakeControlRoom({ pause: { by: "marian@kamenistak.com", why: "x" } }); const c = ctx();
		await uptimeTick(mkEnv(cr), QUIET, c, [bad("a")], async () => {}, 0);
		await c.done();
		expect(cr.posts()).toEqual([]);
	});

	it("failure path: a failed check on a quiet tick reports failed once with the errors and does not use the fallback webhook", async () => {
		const cr = fakeControlRoom(); const c = ctx(); let alerts = 0;
		const r = await uptimeTick(mkEnv(cr), QUIET, c, [ok("a"), bad("b")], async () => void alerts++, 0);
		await c.done();
		expect(r.failures).toEqual(["b"]); expect(r.delivered).toBe(true); expect(alerts).toBe(0);
		expect(cr.posts()).toHaveLength(1);
		expect(cr.posts()[0]).toMatchObject({ status: "failed", kpi_pass: "no", errors: ["b"], iterations: 2, version: "ver-1" });
		expect(cr.posts()[0].steps.map((s: any) => s.items_out)).toEqual([1, 0]);
	});

	it("failure path: when control-room cannot take the report the fallback webhook fires, so a break is never silent", async () => {
		const down = { CONTROL_ROOM: { fetch: async () => new Response("", { status: 500 }) }, CONTROL_ROOM_TOKEN: "t" } as unknown as RunEnv;
		let alerts: string[] = []; const c = ctx();
		await uptimeTick(down, QUIET, c, [bad("b")], async (f) => void (alerts = f), 0);
		expect(alerts).toEqual(["b"]);
		alerts = [];
		await uptimeTick({} as RunEnv, QUIET, ctx(), [bad("b")], async (f) => void (alerts = f), 0);
		expect(alerts).toEqual(["b"]);
	});

	it("retry: a check that fails once then passes is not a failure; a throw is retried and then reported with its error", async () => {
		const cr = fakeControlRoom(); const c = ctx(); let n = 0;
		const flaky: UptimeCheck = { name: "flaky", run: async () => ++n > 1 };
		const boom: UptimeCheck = { name: "boom", run: async () => { throw new Error("socket closed"); } };
		const r = await uptimeTick(mkEnv(cr), DAILY, c, [flaky, boom], async () => {}, 0);
		await c.done();
		expect(n).toBe(2);
		expect(r.failures).toEqual(["boom (Error: socket closed)"]);
	});

	it("a zz- REPORT_JOB_ID (test deploys) reports every tick, live, under that id", async () => {
		const cr = fakeControlRoom(); const c = ctx();
		await uptimeTick(mkEnv(cr, { REPORT_JOB_ID: "zz-toolkit-proof" }), QUIET, c, [ok("a")], async () => {}, 0);
		await c.done();
		expect(cr.posts().map((b) => b.event ?? "end")).toEqual(["start", "step", "end"]);
		expect(cr.posts().every((b) => b.job_id === "zz-toolkit-proof" && b.is_test === true)).toBe(true);
	});
});
