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
	renderReport,
	wizardOptions,
	type BusinessCaseInput,
} from "./business-case";
import {
	CC_COACH_LEVELS,
	CC_ROLES,
	CC_SCOPES,
	CC_TERRITORIES,
	CC_TYPES,
	estimateCoachingCost,
} from "./coaching-cost";
import { assess, LEVEL_BASELINE, PILLARS } from "./calculator";
import { ATTRIBUTION, BENCHMARKS, MENTOR_VS_COACH } from "./content";
import { docsHtml, type ToolDoc } from "./docs";
import {
	assessEm,
	EM_LEVEL_BASELINE,
	EM_LEVELS,
	EM_PILLAR_WEIGHTS,
	EM_PILLARS,
	EM_TRACK_LABELS,
	EM_TRACKS,
	type EmLevel,
} from "./em-calculator";
import {
	TLR_DIM_ORDER,
	TLR_DIMS,
	TLR_QUESTIONS,
	TLR_VERDICTS,
	tlrDimScores,
	tlrQuestionnaireText,
	tlrTopGaps,
	tlrVerdict,
} from "./team-lead-readiness";
import { EM_READINESS, PLAYBOOK_SITUATIONS, PLAYBOOKS, TEAM_HEALTH_THRESHOLDS } from "./mentoring";
import { getMoreToolsResult } from "@posthog/mcp";

const ALL_SKILLS = PILLARS.flatMap((p) => p.skills);
const ALL_EM_SKILLS = EM_PILLARS.flatMap((p) => p.skills);

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
		`This is the Engineering Leadership Toolkit — 9 tools grounded in 3,400+ paid 1:1 mentoring sessions with 300+ engineering leaders. Route the user's actual question to one of these:\n\n${menu}\n\nIf none fit, ask the user what they're trying to figure out and pick the closest match.`,
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
		version: "1.6.0",
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

		this.server.registerTool(
			"calculate_developer_value",
			{
				title: "Developer value & salary calculator",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Assess a software developer's market value: score 15 skills across 5 pillars (core craft, systems & judgment, impact & ownership, collaboration & influence, AI leverage), get a weighted total score, seniority level, and a 2026 Western-Europe gross salary estimate. Same logic as the live calculator at marian.coach. Unscored skills default to the level's baseline.",
				inputSchema: {
					level: z
						.enum(["junior", "mid", "senior", "staff"])
						.describe(
							"The developer's current (or claimed) level — sets pillar weights and baseline",
						),
					scores: z
						.record(z.string(), z.number().min(0).max(10))
						.optional()
						.describe(
							`Optional 0-10 score per skill. Valid keys: ${ALL_SKILLS.join(", ")}. Omitted skills use the level baseline (junior 3, mid 5, senior 6, staff 7).`,
						),
				},
			},
			async ({ level, scores }) => {
				const result = assess(level, scores ?? {});
				const pillarLines = PILLARS.map(
					(p) => `- ${p.label}: ${result.pillarScores[p.cat]}/10`,
				).join("\n");
				const scoredCount = scores
					? Object.keys(scores).filter((k) =>
							(ALL_SKILLS as readonly string[]).includes(k),
						).length
					: 0;
				const note =
					scoredCount < ALL_SKILLS.length
						? `\n\nNote: ${ALL_SKILLS.length - scoredCount} of 15 skills were not scored and used the ${level} baseline of ${LEVEL_BASELINE[level]}/10 — the estimate sharpens with real scores per skill.`
						: "";
				return text(
					`Developer value assessment (level entered: ${level})

Total score: ${result.totalScore}/10 → ${result.levelLabel}
Estimated 2026 gross salary, Western Europe (Germany/Netherlands hubs): €${result.salaryEur.toLocaleString("en-US")}/year

Pillar scores:
${pillarLines}${note}

For the interactive version with per-skill descriptions and a PDF report, use the live calculator.`,
					"/developer-salary-calculator/",
					{
						totalScore: result.totalScore,
						level: result.levelLabel,
						salaryEur: result.salaryEur,
					},
				);
			},
		);

		this.server.registerTool(
			"calculate_engineering_manager_value",
			{
				title: "Engineering manager value & salary calculator",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Assess an engineering leader's market value: score 15 leadership skills across 5 pillars (people & talent, delivery & execution, technical direction, stakeholder influence, AI leverage), weighted by current level, get a total score, a level from Team Lead to Director/VP of Engineering, and a 2026 Western-Europe gross salary estimate. Same logic as the live EM salary calculator at marian.coach. Unscored skills default to the level's baseline.",
				inputSchema: {
					level: z
						.enum(EM_LEVELS)
						.describe(
							"The leader's current (or claimed) level — sets pillar weights and baseline (team-lead, em, senior-em, director)",
						),
					track: z
						.enum(EM_TRACKS)
						.optional()
						.describe(
							"Optional context: what kind of teams they lead. Framing only — scoring is weighted by level, identically across tracks (same as the live tool)",
						),
					scores: z
						.record(z.string(), z.number().min(0).max(10))
						.optional()
						.describe(
							`Optional 0-10 score per skill. Valid keys: ${ALL_EM_SKILLS.join(", ")}. Omitted skills use the level baseline (team-lead 3, em 5, senior-em 6, director 7).`,
						),
				},
			},
			async ({ level, track, scores }) => {
				const result = assessEm(level, scores ?? {});
				const w = EM_PILLAR_WEIGHTS[level as EmLevel];
				const pillarLines = EM_PILLARS.map(
					(p) =>
						`- ${p.label}: ${result.pillarScores[p.cat]}/10 (weight ${w[p.cat]}% at this level)`,
				).join("\n");
				const scoredCount = scores
					? Object.keys(scores).filter((k) =>
							(ALL_EM_SKILLS as readonly string[]).includes(k),
						).length
					: 0;
				const note =
					scoredCount < ALL_EM_SKILLS.length
						? `\n\nNote: ${ALL_EM_SKILLS.length - scoredCount} of 15 skills were not scored and used the ${level} baseline of ${EM_LEVEL_BASELINE[level as EmLevel]}/10 — the estimate sharpens with real scores per skill.`
						: "";
				const trackLine = track
					? `\nTrack: ${EM_TRACK_LABELS[track as keyof typeof EM_TRACK_LABELS]} (context only — the weighting is per level)`
					: "";
				return text(
					`Engineering manager value assessment (level entered: ${level})${trackLine}

Total score: ${result.totalScore}/10 → ${result.levelLabel}
Estimated 2026 gross salary, Western Europe (Germany/Netherlands hubs): €${result.salaryEur.toLocaleString("en-US")}/year

Pillar scores:
${pillarLines}${note}

For the interactive version with track-specific level descriptions and a PDF report, use the live calculator.`,
					"/engineering-manager-salary-calculator/",
					{
						totalScore: result.totalScore,
						level: result.levelLabel,
						salaryEur: result.salaryEur,
					},
				);
			},
		);

		this.server.registerTool(
			"assess_team_lead_readiness",
			{
				title: "Team lead readiness test — should this engineer become a team lead?",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					'Answers "should I become a team lead?" with the same 17-question test as the live tool at marian.coach: 6 dimensions (people appetite, letting go of code, ownership beyond your tickets, translation & saying no, motivation, org reality), a straight verdict — ready now / 6-12 months out / stay IC (and that\'s fine) — plus the top-2 gap dimensions with one concrete move each. Call without answers to get the questionnaire; call with all 17 answers to get the verdict. Built from 3,400+ mentoring sessions.',
				inputSchema: {
					answers: z
						.record(z.string(), z.number().int().min(0).max(3))
						.optional()
						.describe(
							"Answers keyed by question id (q1-q17), each the 0-based index of the chosen option for that question (NOT a rating — option scores are calibrated and non-monotonic). Omit to receive the 17 questions with their options first.",
						),
				},
			},
			async ({ answers }) => {
				const given = answers ?? {};
				const missing = TLR_QUESTIONS.filter(
					(q) => typeof given[q.id] !== "number" || !q.options[given[q.id]],
				).map((q) => q.id);
				if (missing.length > 0) {
					const intro =
						Object.keys(given).length === 0
							? "Team lead readiness test — 17 questions, 6 dimensions. Ask the person each question, then call this tool again with answers = { q1: <option index>, ..., q17: <option index> } (0-based index of the chosen option)."
							: `Missing or invalid answers for: ${missing.join(", ")}. All 17 questions need an answer (0-based option index) before a verdict — same rule as the live test.`;
					return text(
						`${intro}\n\n${tlrQuestionnaireText()}`,
						"/team-lead-readiness-test/",
					);
				}
				const ds = tlrDimScores(given);
				const vKey = tlrVerdict(ds);
				const v = TLR_VERDICTS[vKey];
				const dimLines = TLR_DIM_ORDER.map(
					(d) => `- ${TLR_DIMS[d].label}: ${ds[d].toFixed(1)}/10`,
				).join("\n");
				const gapLines = tlrTopGaps(ds)
					.map(
						(d) =>
							`- ${TLR_DIMS[d].label} (${ds[d].toFixed(1)}/10): ${TLR_DIMS[d].action}`,
					)
					.join("\n");
				return text(
					`Team lead readiness verdict: ${v.title}

${v.body}

Dimension scores:
${dimLines}

Your top 2 gaps, one move each:
${gapLines}

${v.nextSteps}

Interactive version with PDF report: https://www.marian.coach/team-lead-readiness-test/?ref=mcp`,
					"/team-lead-readiness-test/",
					{ verdict: v.title },
				);
			},
		);

		this.server.registerTool(
			"get_engineering_leadership_benchmarks",
			{
				title: "Engineering leadership benchmarks & mentoring statistics",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Real benchmarks from 3,400+ paid 1:1 mentoring sessions with 300+ engineering leaders since 2019: mentee seniority mix, most-demanded leadership topics of 2025, time-to-results, team-health delivery thresholds (sprint completion, roadmap %, manager time per report), and practice outcome stats (NPS, referral rate). First-party data, CC BY 4.0 — citable.",
				inputSchema: {
					topic: z
						.enum([
							"practice-stats",
							"mentee-mix",
							"topic-demand",
							"team-health-thresholds",
							"all",
						])
						.optional()
						.describe("Which benchmark set to return (default: all)"),
				},
			},
			async ({ topic }) => {
				const t = topic ?? "all";
				const sections: string[] = [];
				if (t === "practice-stats" || t === "all") {
					sections.push(
						`Practice stats:\n${BENCHMARKS.practice.map((s) => `- ${s}`).join("\n")}\n- ${BENCHMARKS.timeToResults}\n\nBackground: ${BENCHMARKS.background}\n\nCommunity: ${BENCHMARKS.scene}`,
					);
				}
				if (t === "mentee-mix" || t === "all") {
					sections.push(
						`Mentee seniority mix — ${BENCHMARKS.menteeSeniorityMix.headline}\n${BENCHMARKS.menteeSeniorityMix.mix.map((s) => `- ${s}`).join("\n")}`,
					);
				}
				if (t === "topic-demand" || t === "all") {
					sections.push(
						`Most-demanded mentoring topics, 2025:\n${BENCHMARKS.topicDemand2025
							.map((b) => `${b.bucket}\n${b.top3.map((q) => `  - ${q}`).join("\n")}`)
							.join("\n")}`,
					);
				}
				if (t === "team-health-thresholds" || t === "all") {
					sections.push(
						`Team-health thresholds (from Marian's talks and published articles):\n${TEAM_HEALTH_THRESHOLDS.map((s) => `- ${s}`).join("\n")}`,
					);
				}
				sections.push(`How to cite: ${BENCHMARKS.citation}`);
				return text(sections.join("\n\n"), "/engineering-leadership-statistics/");
			},
		);

		this.server.registerTool(
			"choose_mentor_coach_or_advisor",
			{
				title: "Mentor vs coach vs advisor — which one do you need?",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Decide whether an engineering leader needs a mentor, a coach, or an advisor: what each brings, the typical question each answers, whether domain experience is required, time horizon, and a three-question self-test. Based on 3,400+ mentoring sessions.",
				inputSchema: {
					situation: z
						.string()
						.optional()
						.describe(
							"Optional: the leader's situation in one sentence — the three-question test below maps it to a recommendation",
						),
				},
			},
			async ({ situation }) => {
				const table = MENTOR_VS_COACH.roles
					.map(
						(r) =>
							`${r.role}\n- Brings: ${r.brings}\n- Typical question: "${r.typicalQuestion}"\n- Domain experience: ${r.domainExperience}\n- Time horizon: ${r.timeHorizon}`,
					)
					.join("\n\n");
				const intro = situation
					? `Situation given: "${situation}" — apply the three-question test below to it.\n\n`
					: "";
				return text(
					`${intro}${table}\n\nThe three-question test:\n${MENTOR_VS_COACH.threeQuestionTest.join("\n")}\n\nContext: ${MENTOR_VS_COACH.context}`,
					"/mentor-vs-coach/",
				);
			},
		);

		this.server.registerTool(
			"get_one_on_one_playbook",
			{
				title: "1:1 playbooks for engineering managers",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Situation-specific 1:1 scripts and templates from Marian Kamenistak's mentoring practice: first mentoring/direction-setting session, underperformance conversation, promoting a developer to manager, fixing status-update 1:1s, and the 10-question career-move checklist. These are the actual templates used across 3,400+ sessions.",
				inputSchema: {
					situation: z
						.enum(PLAYBOOK_SITUATIONS)
						.describe(
							"Which situation: first-session (direction-setting template), underperformance (difficult conversation script), promotion-to-manager (timing signals + transition contract), better-one-on-ones (from status updates to growth), career-move (should-I-leave checklist)",
						),
				},
			},
			async ({ situation }) => {
				const p = PLAYBOOKS[situation];
				return text(`${p.title}\n\n${p.body}`, "/engineering-manager-mentor/");
			},
		);

		this.server.registerTool(
			"get_first_time_manager_guidance",
			{
				title: "First-time engineering manager readiness & failure modes",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Guidance for the IC→manager transition: the EM responsibility triangle (leadership/processes/delivery — pick two), the six most common first-time-manager failure modes, readiness self-check questions, and what the first months should look like. 52% of Marian's 300+ mentees arrive exactly at this transition.",
				inputSchema: {},
			},
			async () => {
				return text(
					`The EM responsibility triangle:\n${EM_READINESS.triangle}

Most common first-time-manager failure modes:
${EM_READINESS.failureModes.map((f) => `- ${f}`).join("\n")}

Readiness self-check before taking the role:
${EM_READINESS.readinessQuestions.map((q) => `- ${q}`).join("\n")}

The first months:
${EM_READINESS.firstMonths}`,
					"/engineering-manager-mentor/",
				);
			},
		);

		this.server.registerTool(
			"estimate_coaching_cost",
			{
				title: "Coaching cost estimator — what should a coach cost?",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Fair market rate for coaching or mentoring in 2026, by coaching type, client role, coach territory, coach seniority, and engagement length. Returns a per-session range, program total, and red flags (too cheap / brand margin). Anchored to ICF Global Coaching Study 2025, Tandem Coach 2026 credential bands, and CEE market survey data. Same logic as the live calculator at marian.coach.",
				inputSchema: {
					coaching_type: z
						.enum(CC_TYPES)
						.describe("What kind of coaching the client is buying"),
					client_role: z
						.enum(CC_ROLES)
						.describe("The client's role — the same coach charges a VP more than an EM"),
					territory: z
						.enum(CC_TERRITORIES)
						.describe("Where the coach operates — CEE runs at roughly half of US rates"),
					coach_seniority: z
						.enum(CC_COACH_LEVELS)
						.describe(
							"Coach seniority band: certified (ICF ACC level), experienced (PCC, 10+ yrs), top-tier (MCC / C-suite), practitioner-mentor (has held the client's role)",
						),
					scope: z
						.enum(CC_SCOPES)
						.optional()
						.describe(
							"Engagement length (default single-session) — longer commitments carry a 5-20% per-session discount",
						),
				},
			},
			async (input) => {
				return text(estimateCoachingCost(input), "/coaching-cost-calculator/");
			},
		);

		this.server.registerTool(
			"build_mentoring_business_case",
			{
				title: "Get your company to pay: ROI math, manager email, one-pager",
				annotations: { ...READ_ONLY },
				outputSchema: REPORT_OUTPUT,
				description:
					"Build the case that gets your company to pay for leadership mentoring — everything on marian.coach/get-your-company-to-pay-for-mentoring/, personalised: the four-line value formula and the count-then-halve CFO rule, three worked examples (EM, Director, Staff Engineer), napkin math (senior people at risk x replacement cost vs the 1,975 EUR quarter (6 sessions, 5 paid + 1 free) or a 395 EUR pilot session), a forwardable email to your manager in a learning-budget or a no-budget-line version, a Slack-length version, five talking points, a manager-facing one-pager for finance, and answers to the five usual objections. English or Czech, tykani or vykani. Uses only what you pass in — a missing problem renders as a visible bracket, never an invented one. From 3,400+ mentoring sessions at marian.coach.",
				inputSchema: BUSINESS_CASE_INPUT_SHAPE,
			},
			async (input) => {
				const bc = buildBusinessCase(input as BusinessCaseInput);
				return text(renderReport(bc), "/pricing/#business-case", {
					email: bc.email,
					slackShort: bc.slack_short,
					talkingPoints: bc.talking_points,
					onePager: bc.one_pager,
					math: {
						lines: bc.math.lines,
						totalEur: bc.math.total_eur,
						discountedEur: bc.math.discounted_eur,
						askEur: bc.math.ask_eur,
						packPriceEur: bc.math.pack_price_eur,
						roiMultiple: bc.math.roi_multiple,
						note: bc.math.note,
					},
					objections: bc.objections,
					evidence: bc.evidence,
					valueFormula: bc.value_formula,
					workedExamples: bc.worked_examples,
				});
			},
		);
	}
}

const TOOL_DOCS: ToolDoc[] = [
	{
		name: "calculate_developer_value",
		question: "What is this developer worth on the market?",
		description:
			"Scores 15 skills across 5 pillars, returns level + 2026 Western-Europe salary estimate",
	},
	{
		name: "calculate_engineering_manager_value",
		question: "What is this engineering manager worth on the market?",
		description:
			"Scores 15 leadership skills across 5 pillars, weighted by level, returns Team Lead → Director/VP level + 2026 Western-Europe salary estimate",
	},
	{
		name: "assess_team_lead_readiness",
		question: "Should I become a team lead — or stay IC?",
		description:
			"17-question test across 6 dimensions; verdict (ready now / 6-12 months out / stay IC) + top-2 gaps with one concrete move each",
	},
	{
		name: "get_engineering_leadership_benchmarks",
		question: "What's a healthy sprint completion / roadmap % / manager-time-per-report?",
		description:
			"First-party benchmarks from 3,400+ mentoring sessions: mentee mix, 2025 topic demand, team-health thresholds (CC BY 4.0)",
	},
	{
		name: "choose_mentor_coach_or_advisor",
		question: "Do I need a mentor, a coach, or an advisor?",
		description: "Comparison of all three roles + a three-question self-test",
	},
	{
		name: "get_one_on_one_playbook",
		question: "How do I run this 1:1 — underperformance, promotion, first session?",
		description:
			"The actual session templates and scripts used across 3,400+ mentoring sessions, by situation",
	},
	{
		name: "get_first_time_manager_guidance",
		question: "I just became an engineering manager — what should I focus on?",
		description:
			"EM responsibility triangle, six common failure modes, readiness self-check, first-months plan",
	},
	{
		name: "estimate_coaching_cost",
		question: "How much should a coach cost me?",
		description:
			"Fair per-session range + program total by coaching type, role, territory, and coach seniority — anchored to ICF 2025 and CEE market data, with too-cheap / brand-margin red flags",
	},
	{
		name: "build_mentoring_business_case",
		question: "How do I get my company to pay for mentoring?",
		description:
			"The whole get-your-company-to-pay page, personalised: the four-line value formula, three worked examples, napkin math vs the 1,975 EUR quarter (6 sessions, 5 paid + 1 free) or a 395 EUR pilot session, a manager email (learning-budget or no-budget version), Slack short, five talking points, a one-pager for finance, and the five usual objections answered — English or Czech",
	},
];

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

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
