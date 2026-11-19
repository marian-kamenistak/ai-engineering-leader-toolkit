/**
 * One entry point every transport calls.
 *
 * dispatch(id, args) -> ServiceResult. The MCP binding wraps it into content blocks; the A2A
 * binding (next) will wrap the same call into message parts. Two thin adapters over one
 * function, so the two protocols cannot answer the same question differently.
 *
 * The handlers below were moved verbatim out of the closures inside
 * EngLeadershipToolkit.init(). Behaviour is unchanged: same guards, same strings, same
 * structured fields. The one difference is that they no longer append their own attribution
 * footer or name their own source page -- dispatch does that from the service's `sourcePath`,
 * so a handler can neither forget it nor attribute itself to the wrong page.
 *
 * Arguments are validated here rather than at each transport, so MCP and A2A cannot enforce
 * different contracts. See the comment on the parse in dispatch() for why that matters.
 */

import { assess, estimateSalary, LEVEL_BASELINE, PILLAR_WEIGHTS, PILLARS } from "../calculator";
import {
	assessEm,
	EM_LEVEL_BASELINE,
	EM_PILLAR_WEIGHTS,
	EM_PILLARS,
	EM_TRACK_LABELS,
	estimateEmSalary,
	type EmLevel,
} from "../em-calculator";
import {
	TLR_DIM_ORDER,
	TLR_DIMS,
	TLR_QUESTIONS,
	TLR_VERDICTS,
	tlrDimScores,
	tlrQuestionnaireText,
	tlrTopGaps,
	tlrVerdict,
} from "../team-lead-readiness";
import { TEAM_HEALTH_THRESHOLDS, type PlaybookSituation } from "../mentoring";
import { estimateCoachingCost } from "../coaching-cost";
import { buildBusinessCase, renderBriefing, type BusinessCaseInput } from "../business-case";
import { z } from "zod";
import {
	coachingCostNext,
	renderBenchmarks,
	renderChooser,
	renderFirstTimeManager,
	renderPlaybook,
	renderValueBriefing,
	type BenchmarkTopic,
} from "./briefings";
import { ALL_EM_SKILLS, ALL_SKILLS, SERVICES } from "./services";
import type { ServiceDefinition, ServiceResult } from "./types";

export class UnknownServiceError extends Error {
	constructor(id: string) {
		super(`Unknown service "${id}".`);
		this.name = "UnknownServiceError";
	}
}

/**
 * Carries the field list a caller needs to recover. A2A's AgentSkill has no inputSchema
 * field, so an agent reading the card can see that a skill exists without any way to learn
 * what it takes. The card publishes JSON Schema through an extension for that reason, but an
 * agent that missed it should still be able to recover from one error rather than guessing.
 */
export class InvalidArgumentsError extends Error {
	constructor(service: ServiceDefinition, cause: z.ZodError) {
		const fields = Object.entries(service.inputSchema).map(([name, schema]) => {
			const def = schema as z.ZodType;
			const optional = def.safeParse(undefined).success;
			return `  ${name}${optional ? " (optional)" : ""} — ${def.description ?? "no description"}`;
		});
		super(
			[
				`Invalid arguments for "${service.id}".`,
				"",
				...cause.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`),
				"",
				"Accepted arguments:",
				...fields,
			].join("\n"),
		);
		this.name = "InvalidArgumentsError";
	}
}

// What each entered level should land on; a different result label is flagged in the briefing.
const DEV_LEVEL_LABEL = {
	junior: "Junior Developer",
	mid: "Mid-Level Developer",
	senior: "Senior Developer",
	staff: "Staff Developer",
} as const;
const EM_LEVEL_LABEL: Record<EmLevel, string> = {
	"team-lead": "Team Lead",
	em: "Engineering Manager",
	"senior-em": "Senior EM / Group Lead",
	director: "Director / VP of Engineering",
};

type Handler = (args: Record<string, unknown>) => ServiceResult | Promise<ServiceResult>;

const HANDLERS: Record<string, Handler> = {
	calculate_developer_value: (a) => {
		const level = a.level as "junior" | "mid" | "senior" | "staff";
		const scores = a.scores as Record<string, number> | undefined;
		// Reject unknown skill ids rather than ignoring them. Until 2026-09-04 an
		// unrecognised key — a typo, or a name copied from the EM calculator — was silently
		// dropped, and the tool returned a fully confident salary built entirely on level
		// baselines with no signal that the input had been discarded. Four independent
		// usability testers hit this; it is the worst class of defect here, because the
		// answer looks right. Same early-return refusal shape as the readiness test.
		const unknownSkills = Object.keys(scores ?? {}).filter(
			(k) => !(ALL_SKILLS as readonly string[]).includes(k),
		);
		if (unknownSkills.length > 0) {
			return {
				report: `Unknown skill ${unknownSkills.length === 1 ? "key" : "keys"}: ${unknownSkills.join(", ")}. Nothing was scored, because scoring these would have silently ignored what you passed.\n\nValid keys: ${ALL_SKILLS.join(", ")}.`,
			};
		}
		const result = assess(level, scores ?? {});
		return {
			report: renderValueBriefing({
				tool: "calculate_developer_value",
				levelEntered: level,
				expectedLabel: DEV_LEVEL_LABEL[level],
				result,
				pillars: PILLARS,
				weights: PILLAR_WEIGHTS[level],
				scores,
				baseline: LEVEL_BASELINE[level],
				salaryFor: estimateSalary,
				nextWhenComplete:
					"ask the user what they want to change. If they are weighing a move into management, call assess_team_lead_readiness (no arguments returns the 17 questions); if they already lead people, call calculate_engineering_manager_value with their level.",
			}),
			data: {
				totalScore: result.totalScore,
				level: result.levelLabel,
				salaryEur: result.salaryEur,
			},
		};
	},

	calculate_engineering_manager_value: (a) => {
		const level = a.level as EmLevel;
		const track = a.track as string | undefined;
		const scores = a.scores as Record<string, number> | undefined;
		// See the matching guard in calculate_developer_value. Unknown skill ids used to be
		// silently dropped, producing a confident salary built purely on baselines.
		const unknownEmSkills = Object.keys(scores ?? {}).filter(
			(k) => !(ALL_EM_SKILLS as readonly string[]).includes(k),
		);
		if (unknownEmSkills.length > 0) {
			return {
				report: `Unknown skill ${unknownEmSkills.length === 1 ? "key" : "keys"}: ${unknownEmSkills.join(", ")}. Nothing was scored, because scoring these would have silently ignored what you passed.\n\nValid keys: ${ALL_EM_SKILLS.join(", ")}.`,
			};
		}
		const result = assessEm(level, scores ?? {});
		const trackLine = track
			? ` Track: ${EM_TRACK_LABELS[track as keyof typeof EM_TRACK_LABELS]} (context only, the weighting is per level).`
			: "";
		return {
			report: renderValueBriefing({
				tool: "calculate_engineering_manager_value",
				levelEntered: level,
				expectedLabel: EM_LEVEL_LABEL[level],
				extraLine: trackLine,
				result,
				pillars: EM_PILLARS,
				weights: EM_PILLAR_WEIGHTS[level],
				scores,
				baseline: EM_LEVEL_BASELINE[level],
				salaryFor: estimateEmSalary,
				nextWhenComplete:
					'ask the user which pillar they want to build first. To check the team side, call get_engineering_leadership_benchmarks with topic = "team-health-thresholds"; build_mentoring_business_case makes the case for a mentoring budget.',
			}),
			data: {
				totalScore: result.totalScore,
				level: result.levelLabel,
				salaryEur: result.salaryEur,
			},
		};
	},

	assess_team_lead_readiness: (a) => {
		const answers = a.answers as Record<string, number> | undefined;
		const given = answers ?? {};
		const missing = TLR_QUESTIONS.filter(
			(q) => typeof given[q.id] !== "number" || !q.options[given[q.id]],
		).map((q) => q.id);
		if (missing.length > 0) {
			const intro =
				Object.keys(given).length === 0
					? "Team lead readiness test — 17 questions, 6 dimensions. Ask the person each question, then call this tool again with answers = { q1: <option index>, ..., q17: <option index> } (0-based index of the chosen option)."
					: `Missing or invalid answers for: ${missing.join(", ")}. All 17 questions need an answer (0-based option index) before a verdict — same rule as the live test.`;
			return { report: `${intro}\n\n${tlrQuestionnaireText()}` };
		}
		const ds = tlrDimScores(given);
		const vKey = tlrVerdict(ds);
		const v = TLR_VERDICTS[vKey];
		const dimLines = TLR_DIM_ORDER.map(
			(d) => `- ${TLR_DIMS[d].label}: ${ds[d].toFixed(1)}/10`,
		).join("\n");
		const gapLines = tlrTopGaps(ds)
			.map((d) => `- ${TLR_DIMS[d].label} (${ds[d].toFixed(1)}/10): ${TLR_DIMS[d].action}`)
			.join("\n");
		return {
			report: `Team lead readiness verdict: ${v.title}

${v.body}

Dimension scores:
${dimLines}

Your top 2 gaps, one move each:
${gapLines}

${v.nextSteps}

Interactive version with PDF report: https://www.marian.coach/team-lead-readiness-test/?ref=mcp`,
			data: { verdict: v.title },
		};
	},

	get_engineering_leadership_benchmarks: (a) => ({
		report: renderBenchmarks((a.topic as BenchmarkTopic | undefined) ?? "all", TEAM_HEALTH_THRESHOLDS),
	}),

	choose_mentor_coach_or_advisor: (a) => ({
		report: renderChooser(a.situation as string | undefined),
	}),

	get_one_on_one_playbook: (a) => ({
		report: renderPlaybook(a.situation as PlaybookSituation),
	}),

	get_first_time_manager_guidance: () => ({ report: renderFirstTimeManager() }),

	estimate_coaching_cost: (a) => ({
		report: `${estimateCoachingCost(a as Parameters<typeof estimateCoachingCost>[0])}\n\nNext: ${coachingCostNext()}`,
	}),

	build_mentoring_business_case: (a) => {
		const bc = buildBusinessCase(a as unknown as BusinessCaseInput);
		return {
			report: renderBriefing(bc, a as unknown as BusinessCaseInput),
			data: {
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
			},
		};
	},
};

/**
 * Guard: anything the registry advertises must be answerable. A service with no handler is a
 * promise the server cannot keep, and the agent card would publish it as a skill. Asserted in
 * the test suite so the failure surfaces at CI rather than at a caller.
 */
export function unimplementedServices(): string[] {
	return SERVICES.filter((s) => !HANDLERS[s.id]).map((s) => s.id);
}

export async function dispatch(
	id: string,
	args: Record<string, unknown>,
): Promise<ServiceResult> {
	const service = SERVICES.find((s) => s.id === id);
	if (!service) throw new UnknownServiceError(id);

	const handler = HANDLERS[id];
	if (!handler) throw new Error(`Service "${id}" is advertised but has no handler.`);

	// Validate HERE, not at the transport. MCP validates through registerTool's schema, but
	// the A2A executor parses JSON and calls this directly — so without this the two
	// transports enforce different contracts and A2A enforces none. elc-trade shipped exactly
	// that gap: assess_speaker_readiness graded an empty string because its background field
	// silently defaulted to "", and eleven testers never found the parameter.
	//
	// .strict() is the other half: an unknown key is now an error that names the valid ones,
	// rather than being dropped in silence while the tool complains about what you did pass.
	// Parsing also applies zod defaults, which the handlers below rely on.
	const parsed = z.object(service.inputSchema).strict().safeParse(args);
	if (!parsed.success) throw new InvalidArgumentsError(service, parsed.error);

	return await handler(parsed.data as Record<string, unknown>);
}
