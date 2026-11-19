/**
 * The MCP binding over the registry: tolerant argument parsing survives the move into the
 * generic registration loop.
 *
 * Driven through a real McpServer + Client over an in-memory transport, so the SDK validates
 * every call against the ADVERTISED (permissive) schema before the handler runs — the
 * invariant mcp-tolerant.ts warns that unit tests on parseArgs alone cannot see.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it, vi } from "vitest";

// McpAgent is a Durable Object base class from the Workers runtime; the tools only need
// `this.server`, so a plain base class is enough to run init() under node.
vi.mock("agents/mcp", () => ({ McpAgent: class {} }));
vi.mock("../src/mcp-usage", async (orig) => ({
	...(await orig<typeof import("../src/mcp-usage")>()),
	instrumentMcpUsage: () => {},
}));

const { EngLeadershipToolkit } = await import("../src/index");

type CallResult = { isError?: boolean; content: { type: string; text: string }[] };
let client: Client;

async function call(name: string, args?: Record<string, unknown>): Promise<CallResult> {
	return (await client.callTool({ name, arguments: args })) as CallResult;
}

beforeAll(async () => {
	const agent = new EngLeadershipToolkit() as InstanceType<typeof EngLeadershipToolkit> & {
		env: unknown;
		props: unknown;
		ctx: unknown;
	};
	agent.env = {};
	agent.props = {};
	agent.ctx = { waitUntil: () => {} };
	await agent.init();
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await agent.server.connect(serverSide);
	client = new Client({ name: "test", version: "1.0" });
	await client.connect(clientSide);
});

describe("tools/list", () => {
	it("advertises the same eleven tools, every field optional", async () => {
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name)).toEqual([
			"get_started",
			"get_more_tools",
			"calculate_developer_value",
			"calculate_engineering_manager_value",
			"assess_team_lead_readiness",
			"get_engineering_leadership_benchmarks",
			"choose_mentor_coach_or_advisor",
			"get_one_on_one_playbook",
			"get_first_time_manager_guidance",
			"estimate_coaching_cost",
			"build_mentoring_business_case",
		]);
		for (const t of tools) expect(t.inputSchema.required ?? [], t.name).toEqual([]);
	});
});

describe("tolerant argument parsing", () => {
	it("get_more_tools with no arguments returns the menu", async () => {
		const r = await call("get_more_tools", {});
		expect(r.isError).toBeFalsy();
		expect(r.content[0].text).toContain("Route the user's actual question");
	});

	// A tools/call with `arguments` omitted entirely is patched to `{}` at the Worker edge
	// (normalizeMcpRequest), before the SDK sees it, so `{}` is what reaches this layer.
	it("get_started with no arguments returns the menu", async () => {
		const r = await call("get_started", {});
		expect(r.isError).toBeFalsy();
		expect(r.content[0].text).toContain("calculate_developer_value");
	});

	it("a no-argument probe on a tool with required fields is a normal result with the field menu", async () => {
		const r = await call("calculate_engineering_manager_value", {});
		expect(r.isError).toBeFalsy();
		expect(r.content[0].text).toContain("needs arguments before it can answer");
		expect(r.content[0].text).toContain("level (required)");
	});

	it("a wrong enum value is an error that lists the valid values", async () => {
		const r = await call("get_one_on_one_playbook", { situation: "firing-someone" });
		expect(r.isError).toBe(true);
		expect(r.content[0].text).toContain("Invalid arguments for `get_one_on_one_playbook`");
		expect(r.content[0].text).toContain("One of: first-session, underperformance");
	});

	it("repairs a recoverable enum spelling instead of rejecting it", async () => {
		const r = await call("get_one_on_one_playbook", { situation: "First_Session" });
		expect(r.isError).toBeFalsy();
		expect(r.content[0].text).not.toContain("Invalid arguments");
	});

	it("a tool whose arguments are all optional answers a probe normally", async () => {
		const r = await call("assess_team_lead_readiness", {});
		expect(r.isError).toBeFalsy();
		expect(r.content[0].text).toContain("17 questions");
	});

	it("readiness test links the live 30-60-90 guide", async () => {
		const answers = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`q${i + 1}`, 0]));
		const r = await call("assess_team_lead_readiness", { answers });
		expect(r.isError).toBeFalsy();
		expect(r.content[0].text).toContain("readiness verdict:");
		expect(r.content[0].text).toContain("https://www.marian.coach/blog/guide-to-leading-your-new-dev-team/");
		expect(r.content[0].text).not.toContain("the-first-90-days-as-engineering-manager");
	});
});

describe("responses are briefings", () => {
	it("results carry one text block and no structuredContent; tools declare no outputSchema", async () => {
		const raw = (await client.callTool({ name: "get_first_time_manager_guidance", arguments: {} })) as Record<string, unknown>;
		expect(raw.structuredContent).toBeUndefined();
		const { tools } = await client.listTools();
		for (const t of tools) expect(t.outputSchema, t.name).toBeUndefined();
	});

	it("the pitch lives in the server instructions once, not in every answer", async () => {
		expect(client.getInstructions()).toContain("3,662 1:1 leadership sessions");
		const r = await call("get_first_time_manager_guidance", {});
		const t = r.content[0].text;
		expect(t).toContain("Next:");
		expect(t).toMatch(/Source: marian\.coach, https:\/\/www\.marian\.coach\/engineering-manager-mentor\/\?ref=mcp$/);
		expect(t).not.toContain("Talk it through with Marian");
	});

	it("a calculator names the weakest pillar and points to the next call", async () => {
		const r = await call("calculate_developer_value", {
			level: "senior",
			scores: { communication: 2, mentoring: 2, "cross-functional": 3 },
		});
		const t = r.content[0].text;
		expect(t).toContain("Weakest pillar: Collaboration & influence");
		expect(t).toContain("Next:");
	});

	it("the chooser leans when the wording allows and asks one question when it does not", async () => {
		const lean = await call("choose_mentor_coach_or_advisor", {
			situation: "How do I handle an underperformer on my team?",
		});
		expect(lean.content[0].text).toContain("Lean: Mentor");
		const none = await call("choose_mentor_coach_or_advisor", { situation: "Things are complicated" });
		expect(none.content[0].text).toContain("No clear lean");
		expect(none.content[0].text).toContain("Ask the user:");
	});

	it("the business case is a short briefing with the surname left out", async () => {
		const r = await call("build_mentoring_business_case", { role: "engineering_manager" });
		const t = r.content[0].text;
		expect(t.length).toBeLessThan(5000);
		expect(t).toContain("Heads-up:");
		expect(t).toContain("Next:");
		expect(t).not.toContain("Kamenistak");
	});
});
