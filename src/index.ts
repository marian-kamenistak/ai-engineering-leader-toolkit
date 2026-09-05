import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import {
	geoFromRequest,
	instrumentMcpUsage,
	type McpGeo,
	type McpUsageConfig,
	type McpUsageEnv,
} from "./mcp-usage";
import {
	BUSINESS_CASE_INPUT_SHAPE,
	buildBusinessCase,
	wizardOptions,
	type BusinessCaseInput,
} from "./business-case";
import { ATTRIBUTION } from "./content";
import { docsHtml, type ToolDoc } from "./docs";
import { SERVICES } from "./core/services";
import { dispatch } from "./core/dispatch";
import { SSE_HEADERS, formatSSEEvent, A2A_PROTOCOL_VERSION } from "@a2a-js/sdk";
import {
	DefaultRequestHandler,
	InMemoryTaskStore,
	JsonRpcTransportHandler,
	ServerCallContext,
	UnauthenticatedUser,
} from "@a2a-js/sdk/server";
import { A2A_PATH, EngLeadershipToolkitExecutor, ORIGIN, buildAgentCard } from "./a2a";
import { getMoreToolsResult } from "@posthog/mcp";

// Every tool is a read-only lookup or calculation over first-party mentoring data:
// nothing mutates, nothing calls out to a third party, and the same input always
// returns the same output. Declaring the full annotation set (rather than just
// readOnlyHint) is what MCP clients use to decide whether a call needs user
// confirmation — and it is one of the things Smithery's quality score grades.
const READ_ONLY = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;

/** Shared output contract. `report` is the same prose the text content carries;
 *  `source` is the canonical marian.coach page the numbers come from. Tools that
 *  produce real numbers add typed fields on top of this via `extra`. */
const REPORT_OUTPUT = {
	report: z.string().describe("The full human-readable report."),
	source: z
		.string()
		.describe("Canonical marian.coach page this answer is derived from."),
	// Optional so one schema serves all nine tools: the calculators and the
	// readiness test populate these, the content tools leave them out.
	totalScore: z
		.number()
		.min(0)
		.max(10)
		.optional()
		.describe("Weighted 0-10 score, when the tool computes one."),
	level: z
		.string()
		.optional()
		.describe("Seniority level the score maps to, when the tool computes one."),
	salaryEur: z
		.number()
		.optional()
		.describe("Estimated 2026 Western-Europe gross annual salary in EUR."),
	verdict: z
		.string()
		.optional()
		.describe("Headline verdict, when the tool returns one."),
	// Business case v2 (build_mentoring_business_case) — structured artefacts, all optional
	// so the one schema keeps serving every tool.
	email: z
		.object({ subject: z.string(), body: z.string() })
		.optional()
		.describe("Forwardable email to the manager."),
	slackShort: z.string().optional().describe("Slack/Teams-length version of the ask."),
	talkingPoints: z.array(z.string()).optional().describe("Five talking points for the conversation."),
	onePager: z
		.object({
			title: z.string(),
			sections: z.array(
				z.object({
					heading: z.string(),
					body: z.string().optional(),
					bullets: z.array(z.string()).optional(),
					table: z.array(z.tuple([z.string(), z.string()])).optional(),
				}),
			),
		})
		.optional()
		.describe("Manager-facing one-pager, forwardable to finance."),
	math: z
		.object({
			lines: z.array(z.string()),
			totalEur: z.number(),
			discountedEur: z.number(),
			askEur: z.number(),
			packPriceEur: z.number(),
			roiMultiple: z.number().nullable(),
			note: z.string(),
		})
		.optional()
		.describe("Napkin math behind the case."),
	objections: z
		.array(z.object({ objection: z.string(), answer: z.string() }))
		.optional()
		.describe("The usual objections, answered."),
	evidence: z
		.array(z.object({ claim: z.string(), source: z.string(), url: z.string() }))
		.optional()
		.describe("Sources the case may cite."),
	valueFormula: z
		.object({ heading: z.string(), lines: z.array(z.string()), rule: z.string() })
		.optional()
		.describe(
			"The four value lines to add up (money saved, cost of delay, missed opportunity, roadmap slippage) plus the count-then-halve CFO rule.",
		),
	workedExamples: z
		.array(
			z.object({
				role: z.string(),
				setup: z.string(),
				kpis: z.string(),
				math: z.string(),
			}),
		)
		.optional()
		.describe("Three published worked examples: EM, Director, Staff Engineer."),
};

function text(
	body: string,
	attributionPath: string,
	extra?: Record<string, unknown>,
) {
	const full = body + ATTRIBUTION(attributionPath);
	return {
		content: [{ type: "text" as const, text: full }],
		// structuredContent is additive: text clients are unaffected, schema-aware
		// clients get machine-readable fields. Must always be present and must match
		// outputSchema, or strict clients reject the response.
		structuredContent: {
			report: full,
			source: `https://www.marian.coach${attributionPath}`,
			...(extra ?? {}),
		},
	};
}

/** Shared by both `get_started` and `get_more_tools`'s greeting branch (see below) — one
 *  source of truth for the menu text so the two entry points never drift apart. */
function getStartedResult() {
	const menu = TOOL_DOCS.map(
		(d) => `- "${d.question}" → \`${d.name}\`: ${d.description}`,
	).join("\n");
	return text(
		`This is the Engineering Leadership Toolkit — 9 tools grounded in 3,611 paid 1:1 mentoring sessions with 300+ engineering leaders. Route the user's actual question to one of these:\n\n${menu}\n\nIf none fit, ask the user what they're trying to figure out and pick the closest match.`,
		"/mcp",
	);
}

/** Matches a bare liveness/greeting ping — "hi", "test", "are you there" — as opposed to a
 *  real described capability gap. Deliberately an exact (trimmed, punctuation-stripped)
 *  match, not a "starts with": a genuine gap report is a sentence, and a loose prefix match
 *  would swallow real ones that happen to start with a greeting word. */
const GREETING_PING =
	/^(hi+|hello+|hey+|yo+|sup|howdy|hola|ahoy|ping|test(ing)?|are you (there|working|alive)|is (this|anyone) (working|there)|still there|you there|greetings|what('?s| is) up)[.!?\s]*$/i;

/** Shared across this Worker's MCP surface — see src/mcp-usage.ts for why both sinks hang
 *  off one hook. The PostHog key is the marian.coach project (same one the site's own
 *  analytics uses), so MCP tool calls and `?ref=mcp` web traffic land in one funnel. */
const USAGE_CONFIG: McpUsageConfig = {
	serverName: "eng-leadership-toolkit",
	domain: "marian.coach",
	posthogKey: "phc_xEinqUjuFui3wB6suwDFAMjQkF9g3G6GcrdqsZQ98dCW",
};

export class EngLeadershipToolkit extends McpAgent<Env, unknown, McpGeo> {
	server = new McpServer({
		name: "eng-leadership-toolkit",
		version: "1.7.0",
	});

	async init() {
		// Before tool registration: instrument() proxies _registeredTools so later
		// registrations are wrapped too, but wiring it first keeps the order obvious.
		instrumentMcpUsage({
			server: this.server,
			config: USAGE_CONFIG,
			env: this.env as McpUsageEnv,
			// Geo rides in on ctx.props from the fetch handler — request.cf is an edge-request
			// property and is long gone by the time a tool handler runs inside the DO.
			geo: this.props ?? {},
			waitUntil: (p) => this.ctx.waitUntil(p),
		});

		this.server.registerTool(
			"get_started",
			{
				title: "Start here — what can this MCP server do?",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Call this for a greeting (hi, hello), a connectivity/liveness test, 'what can you do', or any message too general to match a specific tool below. Returns the full menu of real questions this server answers, each mapped to the tool name that answers it, so the next call can go straight to the right tool.",
				inputSchema: {},
			},
			async () => getStartedResult(),
		);

		this.server.registerTool(
			"get_more_tools",
			{
				title: "More tools? Check here first — also answers a plain hello/liveness ping",
				annotations: { ...READ_ONLY },
				description:
					"Check for additional tools whenever your task might benefit from specialized capabilities, even if existing tools could work as a fallback. Also the right tool for a bare greeting (hi, hello), a connectivity/liveness test, or any message too general to match a specific tool below — pass it as `context` and this returns the full menu instead of a dead end.",
				inputSchema: {
					context: z
						.string()
						.describe(
							"A description of your goal and what kind of tool would help accomplish it, OR a plain greeting/liveness ping like 'hi' or 'test'.",
						),
				},
			},
			async ({ context }) =>
				GREETING_PING.test(context.trim()) ? getStartedResult() : { content: getMoreToolsResult().content },
		);

		// Every domain tool comes from the registry. Adding one means adding a
		// ServiceDefinition in core/services.ts and a handler in core/dispatch.ts -- never
		// another registerTool call here, which is how the descriptions drifted before.
		for (const service of SERVICES) {
			this.server.registerTool(
				service.id,
				{
					title: service.title,
					annotations: { ...READ_ONLY },
					outputSchema: REPORT_OUTPUT,
					description: service.description,
					inputSchema: service.inputSchema,
				},
				async (args: Record<string, unknown>) => {
					const r = await dispatch(service.id, args);
					return text(r.report, service.sourcePath, r.data);
				},
			);
		}
	}
}

/** The docs page and the get_started menu, both derived from the registry. This used to be a
 *  second hand-maintained array, and its descriptions had already drifted from the registered
 *  ones -- same tool, two different descriptions depending on which surface you asked. */
const TOOL_DOCS: ToolDoc[] = SERVICES.map((s) => ({
	name: s.id,
	question: s.question,
	description: s.summary,
}));

const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
	v != null && typeof (v as Record<symbol, unknown>)[Symbol.asyncIterator] === "function";

/** A fresh handler per request: InMemoryTaskStore is per-request state, and every service
 *  here answers synchronously, so a Task never needs to outlive the response. The moment a
 *  long-running service ships, this has to move to a Durable-Object-backed TaskStore. */
function a2aTransportFor() {
	return new JsonRpcTransportHandler(
		new DefaultRequestHandler(
			buildAgentCard(),
			new InMemoryTaskStore(),
			new EngLeadershipToolkitExecutor(),
		),
	);
}

function a2aDocsHtml(): string {
	const skills = SERVICES.map((s) => `<li><code>${s.id}</code> — ${s.description}</li>`).join("\n");
	return `<!doctype html><meta charset="utf-8"><title>Engineering Leadership Toolkit — A2A endpoint</title>
<style>body{font:16px/1.6 system-ui;max-width:44rem;margin:3rem auto;padding:0 1.25rem;color:#111}
code{background:#f4f4f5;padding:.1em .35em;border-radius:3px}pre{background:#f4f4f5;padding:1rem;border-radius:6px;overflow-x:auto}
li{margin:.4rem 0}a{color:#0b57d0}</style>
<h1>Engineering Leadership Toolkit — A2A</h1>
<p>An <a href="https://a2a-protocol.org">A2A v${A2A_PROTOCOL_VERSION}</a> JSON-RPC endpoint. Same services as the
<a href="${ORIGIN}/mcp">MCP server</a>, same answers, either protocol. No authentication, and every skill is free to call
(<a href="${ORIGIN}/auth.md">auth.md</a>).</p>
<p>Agent card: <a href="${ORIGIN}/.well-known/agent-card.json">${ORIGIN}/.well-known/agent-card.json</a></p>
<h2>Calling it</h2>
<pre>curl -X POST ${ORIGIN}${A2A_PATH} \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{
        "messageId":"1","role":"ROLE_USER",
        "parts":[{"text":"{\\"skill\\":\\"assess_team_lead_readiness\\",\\"args\\":{}}"}]}}}'</pre>
<p>Address a skill by sending that JSON as the message text, or by setting <code>skill</code> and
<code>args</code> in the message metadata. The agent card publishes a JSON Schema for every skill's
arguments, so you do not have to guess field names.</p>
<h2>Skills</h2>
<ul>
${skills}
</ul>`;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		const path = url.pathname.replace(/\/$/, "") || "/";

		// A2A JSON-RPC. Must come before /mcp so neither shadows the other.
		if (request.method === "POST" && path === A2A_PATH) {
			const context = new ServerCallContext({
				user: new UnauthenticatedUser(),
				requestedVersion: request.headers.get("A2A-Version") ?? A2A_PROTOCOL_VERSION,
			});
			const result = await a2aTransportFor().handle(await request.text(), context);

			if (isAsyncIterable(result)) {
				const { readable, writable } = new TransformStream();
				const writer = writable.getWriter();
				const enc = new TextEncoder();
				// Deliberately not awaited: awaiting would buffer the whole stream and defeat SSE.
				ctx.waitUntil(
					(async () => {
						try {
							for await (const ev of result) await writer.write(enc.encode(formatSSEEvent(ev)));
						} finally {
							await writer.close();
						}
					})(),
				);
				return new Response(readable, { headers: SSE_HEADERS });
			}
			return Response.json(result);
		}

		// Browsers, crawlers and registry health-checks get docs on the A2A paths. Same
		// reasoning as /mcp below: these URLs are linked from the agent card and from
		// registries, so they must not answer 404/406 to a plain GET.
		if ((request.method === "GET" || request.method === "HEAD") && (path === "/a2a" || path === A2A_PATH)) {
			const html = a2aDocsHtml();
			return new Response(request.method === "HEAD" ? null : html, {
				headers: {
					"content-type": "text/html; charset=utf-8",
					link: `<${ORIGIN}/a2a>; rel="canonical"`,
				},
			});
		}

		if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
			// Browsers/crawlers get the docs page; MCP clients (POST, or GET with
			// Accept: text/event-stream) fall through to the MCP transport.
			//
			// INVERTED 2026-08-08. This used to require `accept.includes("text/html")`, so a GET
			// carrying `Accept: */*` -- curl's default, and what most crawlers, link-checkers and
			// registry health-checks send -- fell through to the transport and came back **406**.
			// Verified live before the fix: Googlebot, bingbot, GPTBot, ClaudeBot and
			// PerplexityBot all got 406 here. This URL is the `websiteUrl` on every MCP registry
			// listing, i.e. the target of every dofollow link earned from them, so the whole
			// registry play was pointing at an error page.
			// Now: serve HTML for ANY GET/HEAD that is not explicitly asking for the SSE stream,
			// which is the one thing only a real MCP client asks for. POST is untouched.
			//
			// HEAD added 2026-08-08: link-checkers and some uptime monitors send HEAD, not GET,
			// and it was falling through to the MCP transport same as an unhandled GET used to --
			// 404 there instead of 406, but the same class of bug. HEAD must carry the identical
			// headers a GET would (spec requirement) with no body.
			const accept = request.headers.get("accept") ?? "";
			const wantsMcpStream = accept.includes("text/event-stream");
			if ((request.method === "GET" || request.method === "HEAD") && !wantsMcpStream) {
				const headers = {
					"content-type": "text/html; charset=utf-8",
					// Three variants of this URL return 200 (apex/www x /mcp,/mcp/), so the
					// canonical has to be stated or the registry links split their equity.
					link: '<https://www.marian.coach/mcp>; rel="canonical"',
				};
				return new Response(request.method === "HEAD" ? null : docsHtml(TOOL_DOCS), { headers });
			}
			// Hand the edge request's geography to the Durable Object. `request.cf` only
			// exists out here; McpAgent forwards ctx.props through to `this.props`.
			(ctx as ExecutionContext & { props?: McpGeo }).props = geoFromRequest(request);
			return EngLeadershipToolkit.serve("/mcp").fetch(request, env, ctx);
		}

		// JSON surface for the marian.coach business-case wizard (same core as the MCP tool).
		// GET  ?lang=en|cs -> wizard options (roles, example problems, KPI chips, alternatives, prices)
		// POST {input}     -> BusinessCase JSON (validated with the tool's own schema)
		if (url.pathname === "/mcp/business-case" || url.pathname === "/mcp/business-case/") {
			const origin = request.headers.get("origin") ?? "";
			const allowed = ["https://www.marian.coach", "http://localhost:4321"];
			const cors = {
				"access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0],
				"access-control-allow-methods": "GET, POST, OPTIONS",
				"access-control-allow-headers": "content-type",
				vary: "origin",
			};
			if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
			if (request.method === "GET") {
				const lang = url.searchParams.get("lang") === "cs" ? "cs" : "en";
				return Response.json(wizardOptions(lang), {
					headers: { ...cors, "cache-control": "public, max-age=3600" },
				});
			}
			if (request.method === "POST") {
				if (Number(request.headers.get("content-length") ?? 0) > 8192) {
					return Response.json({ error: "too_large" }, { status: 413, headers: cors });
				}
				let raw: unknown;
				try {
					raw = await request.json();
				} catch {
					return Response.json({ error: "invalid_json" }, { status: 400, headers: cors });
				}
				const parsed = z.object(BUSINESS_CASE_INPUT_SHAPE).safeParse(raw);
				if (!parsed.success) {
					return Response.json(
						{
							error: "invalid_input",
							issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
						},
						{ status: 400, headers: cors },
					);
				}
				return Response.json(buildBusinessCase(parsed.data as BusinessCaseInput), {
					headers: { ...cors, "cache-control": "no-store" },
				});
			}
			return new Response("Method not allowed", {
				status: 405,
				headers: { ...cors, allow: "GET, POST, OPTIONS" },
			});
		}

		return new Response("Not found. MCP endpoint: https://www.marian.coach/mcp", {
			status: 404,
		});
	},

	/**
	 * Cross-probe uptime monitor for the SIBLING mentoring-inquiry-builder Worker
	 * (marian.coach/mcp/mentoring), every 15 min. Why here: a Worker cannot fetch a URL its
	 * own routes match (Cloudflare's self-recursion guard fails the subrequest), so each MCP
	 * Worker probes the other one. The mentoring Worker probes this /mcp docs page back.
	 * Silent when green; Slack webhook (SLACK_WEBHOOK_URL secret) on failure only.
	 * Never probe this Worker's own /mcp* from here.
	 */
	async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
		const SIBLING = "https://www.marian.coach/mcp/mentoring";
		const checks: { name: string; run: () => Promise<boolean> }[] = [
			{
				name: "mentoring docs GET (wildcard Accept)",
				run: async () => (await fetch(SIBLING, { headers: { accept: "*/*" } })).status === 200,
			},
			{
				name: "mentoring MCP initialize POST",
				run: async () => {
					const r = await fetch(SIBLING, {
						method: "POST",
						headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
						body: JSON.stringify({
							jsonrpc: "2.0",
							id: 1,
							method: "initialize",
							params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "uptime-probe", version: "1.0" } },
						}),
					});
					return r.status === 200;
				},
			},
		];

		const failures: string[] = [];
		for (const c of checks) {
			try {
				if (!(await c.run())) failures.push(c.name);
			} catch (e) {
				failures.push(`${c.name} (${String(e).slice(0, 80)})`);
			}
		}
		if (!failures.length) return;

		console.error("[UPTIME_FAIL]", failures);
		const cf = env as unknown as { SLACK_WEBHOOK_URL?: string };
		if (cf.SLACK_WEBHOOK_URL) {
			await fetch(cf.SLACK_WEBHOOK_URL, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					text: `:rotating_light: Mentoring MCP uptime probe failing (probed from the toolkit Worker): ${failures.join(" · ")} — registries health-check these URLs, fix before listings derank.`,
					unfurl_links: false,
				}),
			}).catch((e) => console.error("uptime slack post failed", String(e)));
		}
	},
};
