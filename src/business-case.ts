/**
 * Mentoring business case v2 — the one core behind three surfaces:
 * the MCP tool `build_mentoring_business_case`, the JSON route
 * `/mcp/business-case` the marian.coach wizard calls, and the public
 * `convince-your-manager` skill (which calls the tool when connected).
 *
 * Returns structured data: a forwardable email (learning-budget or
 * no-budget-line version), a Slack-length version, five talking points,
 * a manager-facing one-pager, the usual objections answered, napkin math,
 * and the evidence list. English or Czech (tykání / vykání).
 *
 * Hard rules: list prices only (430 / 2,580 EUR); invoiced by Marian
 * Kamenistak, sole trader; nothing invented — a missing input renders as
 * a visible [bracket]. Same terms as https://www.marian.coach/pricing/.
 */

import { z } from "zod";
import { STRINGS, type F, type Strings } from "./business-case.i18n";

// ─── Types ────────────────────────────────────────────────────────────────

export type Lang = "en" | "cs";
export type Situation = "ld_budget" | "no_budget";
export type Formality = "informal" | "formal";
export type Alternative = "conference" | "course" | "internal_coach";

export const BUSINESS_CASE_ROLES = [
	"engineering_manager",
	"director",
	"vp_engineering",
	"staff_engineer",
	"product_manager",
] as const;
export type BusinessCaseRole = (typeof BUSINESS_CASE_ROLES)[number];

export const ROLE_LABELS: Record<BusinessCaseRole, string> = STRINGS.en.roles;

export interface BusinessCaseInput {
	role: BusinessCaseRole;
	lang?: Lang;
	formality?: Formality;
	situation?: Situation;
	first_time_in_role?: boolean;
	your_name?: string;
	manager_name?: string;
	company?: string;
	team_size?: number;
	problem?: string;
	kpis?: string[];
	decide_by?: string;
	at_risk_attrition?: number;
	alternatives?: Alternative[];
	/** Legacy, agents only: fully-loaded annual cost per engineer (with team_size). */
	avg_salary_eur?: number;
	/** Legacy, agents only: annual revenue on a slipping roadmap item. */
	delayed_revenue_eur?: number;
}

export interface OnePagerSection {
	heading: string;
	body?: string;
	bullets?: string[];
	table?: [string, string][];
}

export interface BusinessCase {
	email: { subject: string; body: string };
	slack_short: string;
	talking_points: string[];
	one_pager: { title: string; sections: OnePagerSection[] };
	math: {
		lines: string[];
		total_eur: number;
		discounted_eur: number;
		ask_eur: number;
		pack_price_eur: number;
		roi_multiple: number | null;
		note: string;
	};
	evidence: { claim: string; source: string; url: string }[];
	objections: { objection: string; answer: string }[];
	next_steps: string[];
	engagement: string[];
	/** The four value lines + the CFO rule from the public page. Static framing that tells
	 * the reader WHICH numbers to count before the napkin math computes anything. */
	value_formula: { heading: string; lines: string[]; rule: string };
	/** Three role-anchored worked examples from the public page. Static, already published. */
	worked_examples: { role: string; setup: string; kpis: string; math: string }[];
	meta: {
		lang: Lang;
		situation: Situation;
		pack: "first_quarter" | "pilot_session";
		role: BusinessCaseRole;
		first_time: boolean;
		at_risk: number;
	};
}

// ─── Constants ────────────────────────────────────────────────────────────

// List price. Companies pay the same. Without VAT, invoiced by Marian Kamenistak,
// sole trader. The 2,166 (361/session) price exists only through the AI wizard at
// marian.coach/mcp/mentoring + a booked intro — never quoted by this tool.
export const SESSION_PRICE_EUR = 430;
export const SINGLE_SESSION_EUR = SESSION_PRICE_EUR;
export const PACK_SESSIONS = 6;
export const PACK_PRICE_EUR = SESSION_PRICE_EUR * PACK_SESSIONS; // 2,580

// Midpoint of the site's published 40–60k EUR replacement anchor for a senior
// engineer; Gallup (0.5–2x salary) is the cited backing. No salary input needed.
export const ATTRITION_REPLACEMENT_EUR = 50_000;

// Legacy lines (only when an agent passes team_size + avg_salary_eur / delayed_revenue_eur).
export const DEFAULT_AVG_SALARY_EUR = 100_000;
export const ATTRITION_COST_FACTOR = 0.5;
export const TEAM_LIFT_FACTOR = 0.02;
export const DELAY_DIVISOR = 4;

/** Kept for callers that imported the v1 tables. Same content as STRINGS.en.kpis. */
export const KPI_SUGGESTIONS: Record<BusinessCaseRole, string[]> = STRINGS.en.kpis;
export const ENGAGEMENT_STRUCTURE: string[] = STRINGS.en.engagement;

// ─── Input schema (raw zod shape, shared by the MCP tool and the JSON route) ─

export const BUSINESS_CASE_INPUT_SHAPE = {
	role: z
		.enum(BUSINESS_CASE_ROLES)
		.describe("The mentee's role — sets KPI and example-problem suggestions"),
	lang: z.enum(["en", "cs"]).optional().describe("Output language (default en)"),
	formality: z
		.enum(["informal", "formal"])
		.optional()
		.describe("Czech only: ty (informal, default) or Vy (formal)"),
	situation: z
		.enum(["ld_budget", "no_budget"])
		.optional()
		.describe(
			"ld_budget = a learning/L&D budget exists (asks for the 6-session quarter, 2,580 EUR); no_budget = no budget line (asks for one 430 EUR pilot session first). Default ld_budget",
		),
	first_time_in_role: z
		.boolean()
		.optional()
		.describe("First time in this role? Adds the first-time-manager evidence"),
	your_name: z.string().max(80).optional().describe("The mentee's first name (signs the email)"),
	manager_name: z.string().max(80).optional().describe("The manager's first name"),
	company: z.string().max(120).optional().describe("Company name, for the invoice line"),
	team_size: z
		.number()
		.int()
		.min(0)
		.max(5000)
		.optional()
		.describe("Team size, context for the one-pager (and the legacy team-lift line)"),
	problem: z
		.string()
		.max(400)
		.optional()
		.describe(
			"The ONE thing to fix in the next 90 days, in the user's words. Never invent it; leave empty to get a visible placeholder",
		),
	kpis: z
		.array(z.string().max(160))
		.max(3)
		.optional()
		.describe("1–3 measurable 90-day targets; default = the role's suggestions"),
	decide_by: z
		.string()
		.max(60)
		.optional()
		.describe("Decision date, free text (e.g. 'Friday 22 Aug')"),
	at_risk_attrition: z
		.number()
		.int()
		.min(0)
		.max(5)
		.optional()
		.describe("Senior people at risk of leaving (0–5). Drives the napkin math"),
	alternatives: z
		.array(z.enum(["conference", "course", "internal_coach"]))
		.optional()
		.describe("Alternatives already considered"),
	avg_salary_eur: z
		.number()
		.optional()
		.describe("Legacy: fully-loaded annual cost per engineer in EUR, only with team_size"),
	delayed_revenue_eur: z
		.number()
		.optional()
		.describe("Legacy: annual revenue attached to a slipping roadmap item, in EUR"),
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const eur = (lang: Lang, n: number): string =>
	lang === "cs"
		? Math.round(n).toLocaleString("cs-CZ").replace(/ /g, " ")
		: Math.round(n).toLocaleString("en-US");

const round1 = (n: number) => Math.round(n * 10) / 10;

const pickF = (s: F, formality: Formality): string =>
	typeof s === "string" ? s : formality === "formal" ? s.formal : s.informal;

/** Fill {placeholders}; unknown keys stay visible as [key] so nothing is silently invented. */
const fill = (tpl: string, vars: Record<string, string | number>): string =>
	tpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `[${k}]`));

const clean = (s?: string): string | undefined => {
	const t = (s ?? "").trim();
	return t.length ? t : undefined;
};

// ─── Build ────────────────────────────────────────────────────────────────

export function buildBusinessCase(input: BusinessCaseInput): BusinessCase {
	const lang: Lang = input.lang === "cs" ? "cs" : "en";
	const S: Strings = STRINGS[lang];
	const formality: Formality = lang === "cs" && input.formality === "formal" ? "formal" : "informal";
	const situation: Situation = input.situation === "no_budget" ? "no_budget" : "ld_budget";
	const role = input.role;
	const roleLabel = S.roles[role];
	const firstTime = input.first_time_in_role === true;
	const atRisk = Math.max(0, Math.min(5, Math.round(input.at_risk_attrition ?? 0)));
	const alternatives = Array.from(new Set(input.alternatives ?? [])).filter(
		(a): a is Alternative => a === "conference" || a === "course" || a === "internal_coach",
	);

	const yourName = clean(input.your_name);
	const managerName = clean(input.manager_name);
	const company = clean(input.company);
	const problemGiven = clean(input.problem);
	const problem = problemGiven ?? S.fallbacks.problem;
	const decideBy = clean(input.decide_by) ?? S.fallbacks.decide_by;
	const kpisGiven = (input.kpis ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 3);
	const kpis = kpisGiven.length ? kpisGiven : S.kpis[role];

	const askEur = situation === "no_budget" ? SINGLE_SESSION_EUR : PACK_PRICE_EUR;
	const pack = situation === "no_budget" ? "pilot_session" : "first_quarter";

	// ── math ──
	const attritionValue = atRisk * ATTRITION_REPLACEMENT_EUR;
	const teamSize = input.team_size ?? 0;
	const liftValue =
		teamSize > 0 && input.avg_salary_eur ? teamSize * input.avg_salary_eur * TEAM_LIFT_FACTOR : 0;
	const delayValue = input.delayed_revenue_eur ? input.delayed_revenue_eur / DELAY_DIVISOR : 0;
	const total = attritionValue + liftValue + delayValue;
	const discounted = total / 2;
	const roi = total > 0 ? round1(discounted / askEur) : null;

	const mathLines: string[] = [];
	if (atRisk > 0) {
		mathLines.push(
			fill(S.math.attrition, {
				n: atRisk,
				unit: atRisk === 1 ? S.math.person : S.math.people,
				value: eur(lang, attritionValue),
			}),
		);
	}
	if (delayValue > 0) {
		mathLines.push(
			fill(S.math.delay, {
				rev: eur(lang, input.delayed_revenue_eur ?? 0),
				value: eur(lang, delayValue),
			}),
		);
	}
	if (liftValue > 0) {
		mathLines.push(
			fill(S.math.lift, {
				team: teamSize,
				sal: eur(lang, input.avg_salary_eur ?? DEFAULT_AVG_SALARY_EUR),
				value: eur(lang, liftValue),
			}),
		);
	}
	if (total > 0) {
		mathLines.push(
			fill(S.math.cfo, {
				discounted: eur(lang, discounted),
				ask: eur(lang, askEur),
				roi: String(roi),
			}),
		);
	}
	const mathNote =
		total > 0
			? fill(S.math.note_pos, { roi: String(roi) })
			: fill(S.math.note_zero, { ask: eur(lang, askEur) });

	// ── email ──
	const E = S.email[situation];
	const greeting = managerName
		? fill(pickF(E.greeting, formality), { manager: managerName })
		: pickF(E.greeting_fallback, formality);
	const kpiList = kpis.map((k, i) => `${i + 1}. ${k}`).join("\n");
	const atRiskLine =
		atRisk === 0
			? null
			: fill(
					pickF(
						atRisk === 1 ? S.email.at_risk_1 : atRisk >= 5 ? S.email.at_risk_5 : S.email.at_risk_n,
						formality,
					),
					{ n: atRisk },
				);
	const emailParas: (string | null)[] = [
		greeting,
		fill(pickF(E.p1, formality), { problem }),
		pickF(E.p2, formality),
		`${fill(pickF(E.p3, formality), { problem })}\n${kpiList}`,
		pickF(E.p4, formality),
		firstTime ? fill(pickF(S.email.first_time, formality), { role: roleLabel }) : null,
		atRiskLine,
		pickF(S.email.p5, formality),
		fill(pickF(S.email.close, formality), { decide_by: decideBy }),
		yourName ?? S.fallbacks.your_name,
	];
	const emailBody = emailParas.filter((p): p is string => p !== null).join("\n\n");

	// ── slack ──
	const slack = fill(pickF(S.slack.text, formality), {
		manager: managerName ?? S.fallbacks.manager,
		problem,
		budget_line: S.slack.budget_line[situation],
		ask_line: S.slack.ask_line[situation],
		decide_by: decideBy,
	});

	// ── talking points ──
	const talking = [
		fill(S.talking.t1, { problem, kpis: kpis.join("; ") }),
		fill(S.talking.t2, { ask_line: S.slack.ask_line[situation] }),
		S.talking.t3,
		atRisk > 0
			? fill(S.talking.t4_risk, { n: atRisk, ask_eur: eur(lang, askEur) })
			: S.talking.t4_zero,
		S.talking.t5,
	];

	// ── one-pager ──
	const P = S.one_pager;
	const sections: OnePagerSection[] = [
		{ heading: P.s_problem, body: problem.charAt(0).toUpperCase() + problem.slice(1) },
		{ heading: P.s_success, bullets: kpis },
		{ heading: P.s_what, body: P.what_body[situation] },
		{
			heading: P.s_investment,
			table: P.investment_rows[situation].map(
				([k, v]) => [k, fill(v, { company: company ?? S.fallbacks.company })] as [string, string],
			),
		},
		{ heading: P.s_measure, bullets: P.measure_bullets },
		{ heading: P.s_risk, bullets: P.risk_bullets },
		{ heading: P.s_budget, body: P.budget_body[situation] },
	];
	if (firstTime) sections.push({ heading: P.s_why_now, body: fill(P.why_now_body, { role: roleLabel }) });
	if (alternatives.length) {
		sections.push({
			heading: P.s_alternatives,
			bullets: [...alternatives.map((a) => P.alt_bullets[a]), P.alt_closing],
		});
	}
	sections.push(
		total > 0
			? {
					heading: P.s_math,
					bullets: [
						...mathLines.slice(0, -1),
						fill(P.math_risk_closing, {
							discounted: eur(lang, discounted),
							ask: eur(lang, askEur),
							roi: String(roi),
						}),
					],
				}
			: { heading: P.s_math, body: fill(P.math_zero_body, { ask: eur(lang, askEur) }) },
	);
	sections.push(
		{ heading: P.s_give_back, body: P.give_back_body },
		{ heading: P.s_decision, body: fill(P.decision_body, { decide_by: decideBy }) },
	);
	const onePagerTitle = fill(P.title, { your_name: yourName ?? S.fallbacks.your_name, role: roleLabel });

	return {
		email: { subject: E.subject, body: emailBody },
		slack_short: slack,
		talking_points: talking,
		one_pager: { title: onePagerTitle, sections },
		math: {
			lines: mathLines,
			total_eur: total,
			discounted_eur: discounted,
			ask_eur: askEur,
			pack_price_eur: PACK_PRICE_EUR,
			roi_multiple: roi,
			note: mathNote,
		},
		evidence: S.evidence,
		objections: S.objections.map((o) => ({
			objection: pickF(o.objection, formality),
			answer: pickF(o.answer, formality),
		})),
		next_steps: S.next_steps,
		engagement: S.engagement,
		value_formula: S.value_formula,
		worked_examples: S.worked_examples,
		meta: { lang, situation, pack, role, first_time: firstTime, at_risk: atRisk },
	};
}

// ─── Render (plain text for the MCP tool) ─────────────────────────────────

export function renderReport(bc: BusinessCase): string {
	const S = STRINGS[bc.meta.lang];
	const R = S.report;
	const roleLabel = S.roles[bc.meta.role];
	const yourName = bc.one_pager.title.split(": ")[1]?.split(", ")[0] ?? S.fallbacks.your_name;

	const sec = (s: OnePagerSection): string => {
		const out = [`## ${s.heading}`];
		if (s.body) out.push(s.body);
		if (s.bullets) out.push(...s.bullets.map((b) => `- ${b}`));
		if (s.table) out.push(...s.table.map(([k, v]) => `- ${k}: ${v}`));
		return out.join("\n");
	};

	return [
		`# ${fill(R.title, { your_name: yourName, role: roleLabel })}`,
		"",
		`${R.problem}: ${bc.one_pager.sections[0]?.body ?? ""}`,
		"",
		`## ${R.value_formula}`,
		bc.value_formula.heading,
		...bc.value_formula.lines.map((l) => `- ${l}`),
		bc.value_formula.rule,
		"",
		`## ${R.math}`,
		...(bc.math.lines.length ? bc.math.lines.map((l) => `- ${l}`) : []),
		bc.math.note,
		"",
		`## ${R.worked_examples}`,
		...bc.worked_examples.flatMap((w) => [`### ${w.role}`, w.setup, `KPIs: ${w.kpis}`, w.math, ""]),
		`# ${R.one_pager}`,
		bc.one_pager.title,
		"",
		...bc.one_pager.sections.map(sec).flatMap((s) => [s, ""]),
		"---",
		"",
		`# ${R.email}`,
		"",
		`${R.subject}: ${bc.email.subject}`,
		"",
		bc.email.body,
		"",
		"---",
		"",
		`## ${R.slack}`,
		bc.slack_short,
		"",
		`## ${R.talking}`,
		...bc.talking_points.map((t, i) => `${i + 1}. ${t}`),
		"",
		`## ${R.objections}`,
		...bc.objections.flatMap((o) => [`- "${o.objection}"`, `  ${o.answer}`]),
		"",
		`## ${R.engagement}`,
		...bc.engagement.map((e) => `- ${e}`),
		"",
		`## ${R.next_steps}`,
		...bc.next_steps.map((n) => `- ${n}`),
		"",
		`## ${R.evidence}`,
		...bc.evidence.map((e) => `- ${e.claim} (${e.source}) ${e.url}`),
	].join("\n");
}

// ─── Wizard options (chips + prices for the website wizard) ───────────────

export function wizardOptions(lang: Lang) {
	const S = STRINGS[lang === "cs" ? "cs" : "en"];
	return {
		roles: BUSINESS_CASE_ROLES.map((id) => ({ id, label: S.roles[id] })),
		problem_examples: S.problem_examples,
		kpi_suggestions: S.kpis,
		alternatives: (["conference", "course", "internal_coach"] as const).map((id) => ({
			id,
			label: S.alternatives[id],
		})),
		prices: { session_eur: SESSION_PRICE_EUR, pack_sessions: PACK_SESSIONS, pack_eur: PACK_PRICE_EUR },
	};
}
