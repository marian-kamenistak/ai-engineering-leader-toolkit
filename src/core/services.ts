/**
 * The service registry: every capability this server advertises, declared once.
 *
 * Adding a capability means adding an entry here and a handler in dispatch.ts. The MCP tool
 * list, the docs page, the get_started menu and (next) the A2A agent card all derive from
 * this array, so they cannot drift apart the way they had before it existed.
 *
 * `get_started` and `get_more_tools` are deliberately NOT here. They are meta-tools about the
 * server rather than capabilities of it, they take no domain input, and putting them in the
 * registry would put them on the agent card as skills. Same call elc-trade makes.
 *
 * Descriptions are moved verbatim from the registerTool calls they replace. Where TOOL_DOCS
 * carried a second, drifted description for the same tool, the registerTool text won and the
 * TOOL_DOCS text became `summary` -- it was always the one-liner for the menu.
 */

import { z } from "zod";
import { BUSINESS_CASE_INPUT_SHAPE } from "../business-case";
import { CC_COACH_LEVELS, CC_ROLES, CC_SCOPES, CC_TERRITORIES, CC_TYPES } from "../coaching-cost";
import { PILLARS } from "../calculator";
import { EM_LEVELS, EM_PILLARS, EM_TRACKS } from "../em-calculator";
import { PLAYBOOK_SITUATIONS } from "../mentoring";
import type { ServiceDefinition } from "./types";

export const ALL_SKILLS = PILLARS.flatMap((p) => p.skills);
export const ALL_EM_SKILLS = EM_PILLARS.flatMap((p) => p.skills);

/** Every skill here is free to call. Declared rather than assumed, so the agent card's
 *  pricing extension can state it and a caller never has to guess whether it will be billed. */
const FREE = { model: "free" } as const;

export const SERVICES: ServiceDefinition[] = [
	{
		id: "calculate_developer_value",
		title: "Developer value & salary calculator",
		description:
			"Assess a software developer's market value: score 15 skills across 5 pillars (core craft, systems & judgment, impact & ownership, collaboration & influence, AI leverage), get a weighted total score, seniority level, and a 2026 Western-Europe gross salary estimate. Same logic as the live calculator at marian.coach. Unscored skills default to the level's baseline.",
		tags: ["salary", "career", "developer", "benchmarking"],
		examples: [
			"What is this developer worth on the market?",
			"Is a senior engineer on 75k EUR underpaid in the Netherlands?",
			"Score me as a staff engineer and tell me what I should be earning.",
		],
		question: "What is this developer worth on the market?",
		summary:
			"Scores 15 skills across 5 pillars, returns level + 2026 Western-Europe salary estimate",
		kind: "judgment",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/developer-salary-calculator/",
		inputSchema: {
			level: z
				.enum(["junior", "mid", "senior", "staff"])
				.describe("The developer's current (or claimed) level — sets pillar weights and baseline"),
			scores: z
				.record(z.string(), z.number().min(0).max(10))
				.optional()
				.describe(
					`Optional 0-10 score per skill. Valid keys: ${ALL_SKILLS.join(", ")}. Omitted skills use the level baseline (junior 3, mid 5, senior 6, staff 7).`,
				),
		},
	},

	{
		id: "calculate_engineering_manager_value",
		title: "Engineering manager value & salary calculator",
		description:
			"Assess an engineering leader's market value: score 15 leadership skills across 5 pillars (people & talent, delivery & execution, technical direction, stakeholder influence, AI leverage), weighted by current level, get a total score, a level from Team Lead to Director/VP of Engineering, and a 2026 Western-Europe gross salary estimate. Same logic as the live EM salary calculator at marian.coach. Unscored skills default to the level's baseline.",
		tags: ["salary", "career", "engineering-management", "benchmarking"],
		examples: [
			"What is this engineering manager worth on the market?",
			"I run three teams as a senior EM in Berlin. What should I be paid?",
			"How much more is a Director worth than an EM?",
		],
		question: "What is this engineering manager worth on the market?",
		summary:
			"Scores 15 leadership skills across 5 pillars, weighted by level, returns Team Lead → Director/VP level + 2026 Western-Europe salary estimate",
		kind: "judgment",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/engineering-manager-salary-calculator/",
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

	{
		id: "assess_team_lead_readiness",
		title: "Team lead readiness test — should this engineer become a team lead?",
		description:
			'Answers "should I become a team lead?" with the same 17-question test as the live tool at marian.coach: 6 dimensions (people appetite, letting go of code, ownership beyond your tickets, translation & saying no, motivation, org reality), a straight verdict — ready now / 6-12 months out / stay IC (and that\'s fine) — plus the top-2 gap dimensions with one concrete move each. Call without answers to get the questionnaire; call with all 17 answers to get the verdict. Built from 3,611 mentoring sessions.',
		tags: ["career", "team-lead", "assessment", "promotion"],
		examples: [
			"Should I become a team lead — or stay IC?",
			"My best engineer wants to manage. Is she ready?",
			"Give me the team lead readiness questionnaire.",
		],
		question: "Should I become a team lead — or stay IC?",
		summary:
			"17-question test across 6 dimensions; verdict (ready now / 6-12 months out / stay IC) + top-2 gaps with one concrete move each",
		kind: "judgment",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/team-lead-readiness-test/",
		inputSchema: {
			answers: z
				.record(z.string(), z.number().int().min(0).max(3))
				.optional()
				.describe(
					"Answers keyed by question id (q1-q17), each the 0-based index of the chosen option for that question (NOT a rating — option scores are calibrated and non-monotonic). Omit to receive the 17 questions with their options first.",
				),
		},
	},

	{
		id: "get_engineering_leadership_benchmarks",
		title: "Engineering leadership benchmarks & mentoring statistics",
		description:
			"Real benchmarks from 3,611 paid 1:1 mentoring sessions with 300+ engineering leaders since 2019: mentee seniority mix, most-demanded leadership topics of 2025, time-to-results, team-health delivery thresholds (sprint completion, roadmap %, manager time per report), and practice outcome stats (NPS, referral rate). First-party data, CC BY 4.0 — citable.",
		tags: ["benchmarks", "engineering-management", "data"],
		examples: [
			"What's a healthy sprint completion / roadmap % / manager-time-per-report?",
			"What were engineering leaders asking about most in 2025?",
			"Give me citable statistics on engineering leadership mentoring.",
		],
		question: "What's a healthy sprint completion / roadmap % / manager-time-per-report?",
		summary:
			"First-party benchmarks from 3,611 mentoring sessions: mentee mix, 2025 topic demand, team-health thresholds (CC BY 4.0)",
		kind: "data",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/engineering-leadership-statistics/",
		inputSchema: {
			topic: z
				.enum(["practice-stats", "mentee-mix", "topic-demand", "team-health-thresholds", "all"])
				.optional()
				.describe("Which benchmark set to return (default: all)"),
		},
	},

	{
		id: "choose_mentor_coach_or_advisor",
		title: "Mentor vs coach vs advisor — which one do you need?",
		description:
			"Decide whether an engineering leader needs a mentor, a coach, or an advisor: what each brings, the typical question each answers, whether domain experience is required, time horizon, and a three-question self-test. Based on 3,611 mentoring sessions.",
		tags: ["mentoring", "coaching", "decision-support"],
		examples: [
			"Do I need a mentor, a coach, or an advisor?",
			"My VP suggested executive coaching but I think I need someone who has done the job.",
		],
		question: "Do I need a mentor, a coach, or an advisor?",
		summary: "Comparison of all three roles + a three-question self-test",
		kind: "data",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/mentor-vs-coach/",
		inputSchema: {
			situation: z
				.string()
				.optional()
				.describe(
					"Optional: the leader's situation in one sentence — the three-question test below maps it to a recommendation",
				),
		},
	},

	{
		id: "get_one_on_one_playbook",
		title: "1:1 playbooks for engineering managers",
		description:
			"Situation-specific 1:1 scripts and templates from Marian Kamenistak's mentoring practice: first mentoring/direction-setting session, underperformance conversation, promoting a developer to manager, fixing status-update 1:1s, and the 10-question career-move checklist. These are the actual templates used across 3,611 sessions.",
		tags: ["one-on-ones", "playbook", "engineering-management"],
		examples: [
			"How do I run this 1:1 — underperformance, promotion, first session?",
			"I have to tell someone their performance is not good enough. Give me the script.",
		],
		question: "How do I run this 1:1 — underperformance, promotion, first session?",
		summary:
			"The actual session templates and scripts used across 3,611 mentoring sessions, by situation",
		kind: "data",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/engineering-manager-mentor/",
		inputSchema: {
			situation: z
				.enum(PLAYBOOK_SITUATIONS)
				.describe(
					"Which situation: first-session (direction-setting template), underperformance (difficult conversation script), promotion-to-manager (timing signals + transition contract), better-one-on-ones (from status updates to growth), career-move (should-I-leave checklist)",
				),
		},
	},

	{
		id: "get_first_time_manager_guidance",
		title: "First-time engineering manager readiness & failure modes",
		description:
			"Guidance for the IC→manager transition: the EM responsibility triangle (leadership/processes/delivery — pick two), the six most common first-time-manager failure modes, readiness self-check questions, and what the first months should look like. 52% of Marian's 300+ mentees arrive exactly at this transition.",
		tags: ["career", "first-time-manager", "engineering-management"],
		examples: [
			"I just became an engineering manager — what should I focus on?",
			"What do first-time engineering managers usually get wrong?",
		],
		question: "I just became an engineering manager — what should I focus on?",
		summary:
			"EM responsibility triangle, six common failure modes, readiness self-check, first-months plan",
		kind: "data",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/engineering-manager-mentor/",
		inputSchema: {},
	},

	{
		id: "estimate_coaching_cost",
		title: "Coaching cost estimator — what should a coach cost?",
		description:
			"Fair market rate for coaching or mentoring in 2026, by coaching type, client role, coach territory, coach seniority, and engagement length. Returns a per-session range, program total, and red flags (too cheap / brand margin). Anchored to ICF Global Coaching Study 2025, Tandem Coach 2026 credential bands, and CEE market survey data. Same logic as the live calculator at marian.coach.",
		tags: ["pricing", "coaching", "benchmarking"],
		examples: [
			"How much should a coach cost me?",
			"A coach quoted me 600 EUR a session for exec coaching in Prague. Is that fair?",
		],
		question: "How much should a coach cost me?",
		summary:
			"Fair per-session range + program total by coaching type, role, territory, and coach seniority — anchored to ICF 2025 and CEE market data, with too-cheap / brand-margin red flags",
		kind: "data",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/coaching-cost-calculator/",
		inputSchema: {
			coaching_type: z.enum(CC_TYPES).describe("What kind of coaching the client is buying"),
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

	{
		id: "build_mentoring_business_case",
		title: "Get your company to pay: ROI math, manager email, one-pager",
		description:
			"Build the case that gets your company to pay for leadership mentoring — everything on marian.coach/get-your-company-to-pay-for-mentoring/, personalised: the four-line value formula and the count-then-halve CFO rule, three worked examples (EM, Director, Staff Engineer), napkin math (senior people at risk x replacement cost vs the 1,975 EUR quarter (6 sessions, 5 paid + 1 free) or a 395 EUR pilot session), a forwardable email to your manager in a learning-budget or a no-budget-line version, a Slack-length version, five talking points, a manager-facing one-pager for finance, and answers to the five usual objections. English or Czech, tykani or vykani. Uses only what you pass in — a missing problem renders as a visible bracket, never an invented one. From 3,611 mentoring sessions at marian.coach.",
		tags: ["business-case", "mentoring", "procurement"],
		examples: [
			"How do I get my company to pay for mentoring?",
			"Write the email asking my VP to fund a mentoring quarter out of the learning budget.",
		],
		question: "How do I get my company to pay for mentoring?",
		summary:
			"The whole get-your-company-to-pay page, personalised: the four-line value formula, three worked examples, napkin math vs the 1,975 EUR quarter (6 sessions, 5 paid + 1 free) or a 395 EUR pilot session, a manager email (learning-budget or no-budget version), Slack short, five talking points, a one-pager for finance, and the five usual objections answered — English or Czech",
		kind: "judgment",
		price: FREE,
		fulfilment: "immediate",
		sourcePath: "/pricing/#business-case",
		inputSchema: BUSINESS_CASE_INPUT_SHAPE,
	},
];
