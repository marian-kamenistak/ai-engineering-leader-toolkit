import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
	conversationKey,
	defaultSummarize,
	formatArgs,
	looksAutomated,
	postDemoted,
	postSessionUpdate,
	postUngrouped,
	queueNotify,
	unwrapArguments,
	type McpSessionsKv,
} from "../src/mcp-usage";

describe("unwrapArguments", () => {
	it("unwraps the live tools/call envelope shape", () => {
		const parameters = { request: { params: { arguments: { role: "CTO", team_size: 8 } } } };
		expect(unwrapArguments(parameters)).toEqual({ role: "CTO", team_size: 8 });
	});
	it("unwraps a flat {arguments} shape", () => {
		expect(unwrapArguments({ arguments: { a: 1 } })).toEqual({ a: 1 });
	});
	it("passes through an unrecognized shape as a last resort", () => {
		expect(unwrapArguments({ foo: "bar" })).toEqual({ foo: "bar" });
	});
	it("returns undefined for a non-object", () => {
		expect(unwrapArguments("nope")).toBeUndefined();
		expect(unwrapArguments(null)).toBeUndefined();
	});
});

describe("formatArgs", () => {
	it("renders key: value pairs joined by a middle dot", () => {
		expect(formatArgs({ role: "CTO", team_size: 8 })).toBe("role: CTO · team_size: 8");
	});
	it("skips the SDK-injected context key and empty values", () => {
		expect(formatArgs({ context: "why I called this", role: "CTO", note: "", missing: undefined })).toBe(
			"role: CTO",
		);
	});
	it("truncates a value past 120 chars", () => {
		const long = "x".repeat(200);
		const out = formatArgs({ note: long });
		expect(out).toBe(`note: ${"x".repeat(120)}…`);
	});
	it("caps at 10 fields", () => {
		const args = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`k${i}`, i]));
		expect(formatArgs(args).split(" · ")).toHaveLength(10);
	});
	it("returns empty string for non-object input", () => {
		expect(formatArgs(undefined)).toBe("");
		expect(formatArgs("nope")).toBe("");
	});
});

describe("looksAutomated", () => {
	it("flags a known probe client name", () => {
		expect(looksAutomated({ $mcp_client_name: "mcp-dataset-probe/0.1" }, {})).toBe(true);
		expect(looksAutomated({ $mcp_client_name: "cracked-probe 0.1" }, {})).toBe(true);
	});
	it("flags a synthetic probe tool name", () => {
		expect(
			looksAutomated({ $mcp_tool_name: "__verifymcp_auth_probe_12d20461b38936c3__" }, {}),
		).toBe(true);
	});
	it("flags an unnamed client on a datacentre network", () => {
		expect(looksAutomated({}, { org: "Vultr Holdings, LLC" })).toBe(true);
	});
	it("does not flag a named real client on a residential ISP", () => {
		expect(
			looksAutomated({ $mcp_client_name: "grok-shell-marian-mentoring" }, { org: "Dial Telecom, a.s." }),
		).toBe(false);
	});
	it("does not flag an unnamed client on an unremarkable network", () => {
		expect(looksAutomated({}, { org: "Deutsche Bank AG" })).toBe(false);
	});
});

describe("defaultSummarize", () => {
	it("extracts the first text block, stripped of the attribution footer", () => {
		const response = {
			content: [{ type: "text", text: "matched: First-quarter · 5 focus areas\n\nSource: marian.coach" }],
		};
		expect(defaultSummarize("match_mentoring_focus", response)).toBe("matched: First-quarter · 5 focus areas");
	});
	it("truncates past 200 chars", () => {
		const response = { content: [{ type: "text", text: "y".repeat(300) }] };
		expect(defaultSummarize("t", response)).toBe(`${"y".repeat(200)}…`);
	});
	it("returns undefined when there is no text content", () => {
		expect(defaultSummarize("t", { content: [] })).toBeUndefined();
		expect(defaultSummarize("t", undefined)).toBeUndefined();
		expect(defaultSummarize("t", { content: "not an array" })).toBeUndefined();
	});
});

describe("conversationKey", () => {
	it("is deterministic for the same inputs", () => {
		const props = { $mcp_client_name: "grok-shell", $mcp_client_version: "1.0.13" };
		const geo = { city: "Pilsen", country: "CZ", org: "Dial Telecom" };
		expect(conversationKey("srv", props, geo)).toBe(conversationKey("srv", props, geo));
	});
	it("differs by server name", () => {
		expect(conversationKey("srv-a", { $mcp_client_name: "c" }, {})).not.toBe(
			conversationKey("srv-b", { $mcp_client_name: "c" }, {}),
		);
	});
	it("differs by client identity", () => {
		expect(conversationKey("srv", { $mcp_client_name: "a" }, {})).not.toBe(
			conversationKey("srv", { $mcp_client_name: "b" }, {}),
		);
	});
	it("is namespaced with the server name and an 8-char hex suffix", () => {
		expect(conversationKey("srv", {}, {})).toMatch(/^mcp:sess:srv:[0-9a-f]{8}$/);
	});
});

describe("queueNotify", () => {
	it("runs queued tasks for the same key in order, not interleaved", async () => {
		const order: number[] = [];
		const slow = () => new Promise<void>((resolve) => setTimeout(() => { order.push(1); resolve(); }, 20));
		const fast = () => new Promise<void>((resolve) => { order.push(2); resolve(); });
		const p1 = queueNotify("k", slow);
		const p2 = queueNotify("k", fast);
		await Promise.all([p1, p2]);
		expect(order).toEqual([1, 2]);
	});
});

class FakeKv implements McpSessionsKv {
	private store = new Map<string, string>();
	async get(key: string) {
		return this.store.get(key) ?? null;
	}
	async put(key: string, value: string) {
		this.store.set(key, value);
	}
}

describe("postSessionUpdate", () => {
	const config = { serverName: "srv", domain: "example.com", posthogKey: "phc_x" };
	const env = { SLACK_BOT_TOKEN_ELC: "xoxb-test", MCP_USAGE_SLACK_CHANNEL: "C123" };
	const note = { toolName: "get_started", argLine: "", isError: false } as const;

	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init: { body?: string }) => {
				const body = JSON.parse(init.body ?? "{}");
				const ts = body.thread_ts ? undefined : "1700000000.000001";
				return new Response(JSON.stringify({ ok: true, ts }), { status: 200 });
			}),
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("posts a new parent and persists state on the first call", async () => {
		const kv = new FakeKv();
		await postSessionUpdate(kv, "k1", env, config, {}, {}, note);
		const stored = JSON.parse((await kv.get("k1")) ?? "null");
		expect(stored).toMatchObject({ threadTs: "1700000000.000001", calls: 1 });
	});

	it("threads a second call and increments the count", async () => {
		const kv = new FakeKv();
		await postSessionUpdate(kv, "k1", env, config, {}, {}, note);
		await postSessionUpdate(kv, "k1", env, config, {}, {}, note);
		const stored = JSON.parse((await kv.get("k1")) ?? "null");
		expect(stored.calls).toBe(2);
	});

	it("does not persist state when Slack is unconfigured", async () => {
		const kv = new FakeKv();
		await postSessionUpdate(kv, "k1", {}, config, {}, {}, note);
		expect(await kv.get("k1")).toBeNull();
	});
});

describe("postDemoted / postUngrouped", () => {
	const env = { SLACK_BOT_TOKEN_ELC: "xoxb-test", MCP_USAGE_SLACK_CHANNEL: "C123" };
	const config = { serverName: "srv", domain: "example.com", posthogKey: "phc_x" };

	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ ok: true, ts: "1.1" }), { status: 200 })),
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("postDemoted does not throw for a probe-shaped call", async () => {
		await expect(postDemoted(env, { $mcp_client_name: "mcp-vouch" }, {})).resolves.toBeUndefined();
	});

	it("postUngrouped does not throw when no KV binding exists", async () => {
		const note = { toolName: "get_started", argLine: "", isError: false } as const;
		await expect(postUngrouped(env, config, {}, {}, note)).resolves.toBeUndefined();
	});
});
