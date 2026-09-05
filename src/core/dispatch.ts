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
 * Argument validation deliberately does NOT live here yet. MCP validates through
 * registerTool's schema, which is every caller today. It has to move here when the A2A
 * binding lands, because that path parses JSON and calls dispatch directly -- elc-trade
 * shipped exactly that gap and it let a skill grade an empty string.
 */

import { assess, LEVEL_BASELINE, PILLARS } from "../calculator";
import { BENCHMARKS, MENTOR_VS_COACH } from "../content";
import {
	assessEm,
	EM_LEVEL_BASELINE,
	EM_PILLAR_WEIGHTS,
	EM_PILLARS,
	EM_TRACK_LABELS,
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
import { EM_READINESS, PLAYBOOKS, TEAM_HEALTH_THRESHOLDS } from "../mentoring";
import { estimateCoachingCost } from "../coaching-cost";
import { buildBusinessCase, renderReport, type BusinessCaseInput } from "../business-case";
import { ALL_EM_SKILLS, ALL_SKILLS, SERVICES } from "./services";
import type { ServiceResult } from "./types";

export class UnknownServiceError extends Error {
	constructor(id: string) {
		super(`Unknown service "${id}".`);
		this.name = "UnknownServiceError";
	}
}

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
		const pillarLines = PILLARS.map(
			(p) => `- ${p.label}: ${result.pillarScores[p.cat]}/10`,
		).join("\n");
		const scoredCount = scores
			? Object.keys(scores).filter((k) => (ALL_SKILLS as readonly string[]).includes(k)).length
			: 0;
		const note =
			scoredCount < ALL_SKILLS.length
				? `\n\nNote: ${ALL_SKILLS.length - scoredCount} of 15 skills were not scored and used the ${level} baseline of ${LEVEL_BASELINE[level]}/10 — the estimate sharpens with real scores per skill.`
				: "";
		return {
			report: `Developer value assessment (level entered: ${level})

Total score: ${result.totalScore}/10 → ${result.levelLabel}
Estimated 2026 gross salary, Western Europe (Germany/Netherlands hubs): €${result.salaryEur.toLocaleString("en-US")}/year

Pillar scores:
${pillarLines}${note}

For the interactive version with per-skill descriptions and a PDF report, use the live calculator.`,
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
		const w = EM_PILLAR_WEIGHTS[level as EmLevel];
		const pillarLines = EM_PILLARS.map(
			(p) => `- ${p.label}: ${result.pillarScores[p.cat]}/10 (weight ${w[p.cat]}% at this level)`,
		).join("\n");
		const scoredCount = scores
			? Object.keys(scores).filter((k) => (ALL_EM_SKILLS as readonly string[]).includes(k)).length
			: 0;
		const note =
			scoredCount < ALL_EM_SKILLS.length
				? `\n\nNote: ${ALL_EM_SKILLS.length - scoredCount} of 15 skills were not scored and used the ${level} baseline of ${EM_LEVEL_BASELINE[level as EmLevel]}/10 — the estimate sharpens with real scores per skill.`
				: "";
		const trackLine = track
			? `\nTrack: ${EM_TRACK_LABELS[track as keyof typeof EM_TRACK_LABELS]} (context only — the weighting is per level)`
			: "";
		return {
			report: `Engineering manager value assessment (level entered: ${level})${trackLine}

Total score: ${result.totalScore}/10 → ${result.levelLabel}
Estimated 2026 gross salary, Western Europe (Germany/Netherlands hubs): €${result.salaryEur.toLocaleString("en-US")}/year

Pillar scores:
${pillarLines}${note}

For the interactive version with track-specific level descriptions and a PDF report, use the live calculator.`,
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

	get_engineering_leadership_benchmarks: (a) => {
		const topic = a.topic as string | undefined;
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
		return { report: sections.join("\n\n") };
	},

	choose_mentor_coach_or_advisor: (a) => {
		const situation = a.situation as string | undefined;
		const table = MENTOR_VS_COACH.roles
			.map(
				(r) =>
					`${r.role}\n- Brings: ${r.brings}\n- Typical question: "${r.typicalQuestion}"\n- Domain experience: ${r.domainExperience}\n- Time horizon: ${r.timeHorizon}`,
			)
			.join("\n\n");
		const intro = situation
			? `Situation given: "${situation}" — apply the three-question test below to it.\n\n`
			: "";
		return {
			report: `${intro}${table}\n\nThe three-question test:\n${MENTOR_VS_COACH.threeQuestionTest.join("\n")}\n\nContext: ${MENTOR_VS_COACH.context}`,
		};
	},

	get_one_on_one_playbook: (a) => {
		const situation = a.situation as keyof typeof PLAYBOOKS;
		const p = PLAYBOOKS[situation];
		return { report: `${p.title}\n\n${p.body}` };
	},

	get_first_time_manager_guidance: () => ({
		report: `The EM responsibility triangle:\n${EM_READINESS.triangle}

Most common first-time-manager failure modes:
${EM_READINESS.failureModes.map((f) => `- ${f}`).join("\n")}

Readiness self-check before taking the role:
${EM_READINESS.readinessQuestions.map((q) => `- ${q}`).join("\n")}

The first months:
${EM_READINESS.firstMonths}`,
	}),

	estimate_coaching_cost: (a) => ({
		report: estimateCoachingCost(a as Parameters<typeof estimateCoachingCost>[0]),
	}),

	build_mentoring_business_case: (a) => {
		const bc = buildBusinessCase(a as unknown as BusinessCaseInput);
		return {
			report: renderReport(bc),
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

	return await handler(args);
}
