/**
 * Briefing renderers for the MCP/A2A text layer (Marian 2026-11-19: tool responses are
 * briefings, not payloads). Each function turns the same core data into a short markdown answer:
 * verdict first, a small table, sections only when their condition holds, then a `Next:` line
 * tied to this result. Everything here is deterministic: no model call, no invented figures.
 * There is no peer distribution in this repo, so no percentile is ever printed.
 */

import { BENCHMARKS, MENTOR_VS_COACH } from "../content";
import { EM_READINESS, PLAYBOOKS, type PlaybookSituation } from "../mentoring";

const eur = (n: number) => `€${n.toLocaleString("en-US")}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

interface Pillar {
	cat: string;
	label: string;
	skills: readonly string[];
}

interface ValueBriefingInput {
	/** Tool id, named in the Next line. */
	tool: string;
	levelEntered: string;
	/** Result label the entered level should land on; a different one is flagged. */
	expectedLabel: string;
	extraLine?: string;
	result: { totalScore: number; levelLabel: string; salaryEur: number; pillarScores: Record<string, number> };
	pillars: readonly Pillar[];
	/** Pillar weights in percent for the entered level. */
	weights: Record<string, number>;
	scores: Record<string, number> | undefined;
	baseline: number;
	/** Re-prices a total with the same salary curve the calculator uses. */
	salaryFor: (score: number) => number;
	nextWhenComplete: string;
}

export function renderValueBriefing(i: ValueBriefingInput): string {
	const given = i.scores ?? {};
	const allSkills = i.pillars.flatMap((p) => p.skills);
	const scored = allSkills.filter((s) => typeof given[s] === "number");
	const unscored = allSkills.filter((s) => typeof given[s] !== "number");

	const noScores = scored.length === 0;
	// Heaviest pillar first when nothing is scored (every pillar ties on the baseline); lowest
	// score first otherwise.
	const ranked = [...i.pillars].sort(
		(a, b) =>
			(noScores ? 0 : i.result.pillarScores[a.cat] - i.result.pillarScores[b.cat]) ||
			i.weights[b.cat] - i.weights[a.cat],
	);
	const weakest = ranked[0];
	const weakScore = i.result.pillarScores[weakest.cat];
	const weakW = i.weights[weakest.cat];

	const out: string[] = [
		`${i.result.levelLabel}: score ${i.result.totalScore}/10, about ${eur(i.result.salaryEur)}/year gross (Western Europe, 2026). Level entered: ${i.levelEntered}.${i.extraLine ?? ""}`,
		i.pillars
			.map(
				(p) =>
					`- ${p.label}: ${i.result.pillarScores[p.cat]}/10 (weight ${i.weights[p.cat]}%)${!noScores && p.cat === weakest.cat ? " <- weakest" : ""}`,
			)
			.join("\n"),
	];

	const weakScoredSkills = weakest.skills
		.filter((s) => typeof given[s] === "number")
		.sort((a, b) => given[a] - given[b]);
	const weakestSkill = weakScoredSkills.length
		? `Lowest scored skill in it: ${weakScoredSkills[0]} (${given[weakScoredSkills[0]]}/10).`
		: `None of its skills were scored, so this reads the ${i.levelEntered} baseline of ${i.baseline}/10.`;
	let weakLine = noScores
		? `No skill was scored, so every pillar sits on the ${i.levelEntered} baseline of ${i.baseline}/10 and none is weaker than another. This is the level's default, not an assessment of the person.`
		: `Weakest pillar: ${weakest.label} at ${weakScore}/10, ${weakW}% of the weighting at this level. ${weakestSkill}`;
	if (!noScores && weakScore < 8) {
		const lifted = round1(i.result.totalScore + (weakW / 100) * (8 - weakScore));
		weakLine += ` Lifting it to 8/10 would move the total to ${lifted} and the estimate to about ${eur(i.salaryFor(lifted))}.`;
	} else if (!noScores) {
		weakLine += " Every pillar is 8/10 or above, so there is no single lever left in this model.";
	}
	out.push(weakLine);

	if (i.result.levelLabel !== i.expectedLabel) {
		out.push(
			`Heads-up: you entered ${i.levelEntered} but the scores land on "${i.result.levelLabel}". Confirm the level the person claims, or the scores, before quoting the salary.`,
		);
	}

	const notCovered: string[] = [];
	if (unscored.length) {
		notCovered.push(
			`${unscored.length} of ${allSkills.length} skills were not scored and used the ${i.levelEntered} baseline of ${i.baseline}/10, so the estimate is only as sharp as the scores`,
		);
	}
	notCovered.push(
		"the salary is a gross Western Europe (Germany/Netherlands hubs) model, not a Central or Eastern Europe figure and not a ranking against peers",
	);
	out.push(`Not covered: ${notCovered.join("; ")}.`);

	if (unscored.length) {
		const inWeak = weakest.skills.filter((s) => typeof given[s] !== "number");
		const target = inWeak.length
			? `these ${weakest.label} skills first (${noScores ? "the heaviest pillar at this level" : "the weakest pillar"}): ${inWeak.join(", ")}`
			: `the ${unscored.length} unscored skills`;
		out.push(
			`Next: ask the user to score ${target} (0-10 each), then call ${i.tool} again with level "${i.levelEntered}" and scores.`,
		);
	} else {
		out.push(`Next: ${i.nextWhenComplete}`);
	}
	return out.join("\n\n");
}

// ─── Benchmarks ────────────────────────────────────────────────────────────

export type BenchmarkTopic =
	| "practice-stats"
	| "mentee-mix"
	| "topic-demand"
	| "team-health-thresholds"
	| "all";

const BENCHMARK_NEXT: Record<BenchmarkTopic, string> = {
	all: 'this is the whole set. Re-call with topic = "team-health-thresholds" if the user is judging a team, "mentee-mix" for who mentoring clients are, "topic-demand" for what they ask about, or "practice-stats" for citable practice numbers. Ask the user which metric they are actually measuring.',
	"practice-stats":
		"cite with the line below. Ask the user which claim they need to support, then re-call with topic = \"mentee-mix\" or \"team-health-thresholds\" for the matching evidence.",
	"mentee-mix":
		"52% arrive in their first leadership role, so call get_first_time_manager_guidance when the user is new to managing, or get_one_on_one_playbook with situation = \"promotion-to-manager\" when they are promoting someone.",
	"topic-demand":
		'the top people-topic is boosting an underperformer: call get_one_on_one_playbook with situation = "underperformance" for the script, or re-call with topic = "team-health-thresholds" for the delivery bars.',
	"team-health-thresholds":
		'ask the user which of these their team misses. For the people side call get_one_on_one_playbook with situation = "better-one-on-ones"; to price their own leadership skills call calculate_engineering_manager_value.',
};

export function renderBenchmarks(topic: BenchmarkTopic, thresholds: string[]): string {
	const t = topic;
	const sections: string[] = [
		t === "all"
			? "Engineering leadership benchmarks: practice stats, mentee mix, 2025 topic demand and team-health thresholds, from Marian's own session log."
			: `Engineering leadership benchmarks, ${t} only.`,
	];
	if (t === "practice-stats" || t === "all") {
		sections.push(
			`Practice stats:\n${BENCHMARKS.practice.map((s) => `- ${s}`).join("\n")}\n- ${BENCHMARKS.timeToResults}\n\nBackground: ${BENCHMARKS.background}\n\nCommunity: ${BENCHMARKS.scene}`,
		);
	}
	if (t === "mentee-mix" || t === "all") {
		sections.push(
			`Mentee seniority mix. ${BENCHMARKS.menteeSeniorityMix.headline}\n${BENCHMARKS.menteeSeniorityMix.mix.map((s) => `- ${s}`).join("\n")}`,
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
			`Team-health thresholds (from Marian's talks and published articles):\n${thresholds.map((s) => `- ${s}`).join("\n")}`,
		);
	}
	sections.push(
		`Not covered: these are one practice's numbers (mentees of one mentor, not a survey of the industry), and the thresholds are rules of thumb from talks, not measured distributions.`,
	);
	sections.push(`How to cite: ${BENCHMARKS.citation}`);
	sections.push(`Next: ${BENCHMARK_NEXT[t]}`);
	return sections.join("\n\n");
}

// ─── Mentor, coach or advisor ──────────────────────────────────────────────

type Role = "Mentor" | "Coach" | "Advisor";

// Keyword cues, matched on the user's own words. A lean needs one role to be strictly ahead;
// otherwise the answer is the one question that decides it.
const CUES: Record<Role, RegExp[]> = {
	Mentor: [
		/\bhow (do|to|can|should) (i|we)\b/i,
		/underperform/i,
		/\bpromot/i,
		/first[- ](time|role|manager)/i,
		/\b1[:-]1s?\b|one[- ]on[- ]one/i,
		/\bhir(e|ing)\b/i,
		/delegat/i,
		/team lead|engineering manager|\bEM\b/i,
		/done (the|this) job|been in my (seat|shoes)|someone who has/i,
		/template|script|playbook|handle|difficult conversation/i,
	],
	Coach: [
		/\bstuck\b/i,
		/clarity|what do i (really )?want/i,
		/burn(ed|t)?[- ]?out/i,
		/confidence|imposter/i,
		/motivat|meaning|purpose|values/i,
		/think (out loud|it through)|sounding board|\bmirror\b|reflect/i,
		/not sure (what|if) i/i,
	],
	Advisor: [
		/\b(our|the) (company|org|organi[sz]ation|structure|strategy)\b/i,
		/re-?org|restructur/i,
		/\bwhat should (the company|we)\b/i,
		/board|investor|fractional|interim cto/i,
		/org design|operating model/i,
	],
};

const ROLE_ROW = Object.fromEntries(MENTOR_VS_COACH.roles.map((r) => [r.role, r])) as Record<
	Role,
	(typeof MENTOR_VS_COACH.roles)[number]
>;

const FLIP: Record<Role, string> = {
	Mentor:
		"Switch to a coach if what they need is a mirror to think out loud, not a concrete move (test question 1).",
	Coach:
		"Switch to a mentor if domain scars would change the answer, for example someone who has run the same org (test question 3).",
	Advisor:
		"Switch to a mentor if the problem is theirs and not the company's (test question 2).",
};

function mentorNext(situation: string): string {
	if (/underperform/i.test(situation))
		return 'call get_one_on_one_playbook with situation = "underperformance" for the script.';
	if (/promot/i.test(situation))
		return 'call get_one_on_one_playbook with situation = "promotion-to-manager", or assess_team_lead_readiness if the candidate is still deciding.';
	if (/first[- ](time|role|manager)/i.test(situation))
		return "call get_first_time_manager_guidance.";
	if (/\b1[:-]1s?\b|one[- ]on[- ]one/i.test(situation))
		return 'call get_one_on_one_playbook with situation = "better-one-on-ones".';
	if (/leave|next role|new job|career/i.test(situation))
		return 'call get_one_on_one_playbook with situation = "career-move" for the 10-question checklist.';
	return 'call get_one_on_one_playbook with situation = "first-session" to see how a first mentoring session runs.';
}

export function renderChooser(situation: string | undefined): string {
	const s = (situation ?? "").trim();
	if (!s) {
		const rows = MENTOR_VS_COACH.roles
			.map((r) => `- ${r.role}: ${r.brings}. Asks: "${r.typicalQuestion}" Horizon: ${r.timeHorizon}.`)
			.join("\n");
		return `No situation given, so no lean yet. The three roles:\n\n${rows}\n\nThe three-question test:\n${MENTOR_VS_COACH.threeQuestionTest.join("\n")}\n\nNext: ask the user for their situation in one sentence, then call choose_mentor_coach_or_advisor again with situation. Ask the user now: do you need a concrete move or a mirror to think out loud?`;
	}

	const roles: Role[] = ["Mentor", "Coach", "Advisor"];
	const hits = Object.fromEntries(
		roles.map((r) => [r, CUES[r].filter((re) => re.test(s)).length]),
	) as Record<Role, number>;
	const top = Math.max(...roles.map((r) => hits[r]));
	const leaders = roles.filter((r) => hits[r] === top);

	if (top === 0 || leaders.length > 1) {
		const tied = top === 0 ? roles : leaders;
		const decisive = tied.includes("Advisor")
			? "Is this problem yours or the company's? The company's points to an advisor or fractional CTO, yours to a mentor or coach."
			: "Do you need a concrete move or a mirror to think out loud? A move points to a mentor, a mirror to a coach.";
		return `No clear lean from "${s}": ${top === 0 ? "no cue in it points to one role" : `${tied.join(" and ")} score equally`}. One question decides it.\n\nAsk the user: ${decisive}\n\n${tied.map((r) => `- ${ROLE_ROW[r].role}: ${ROLE_ROW[r].brings}. Horizon: ${ROLE_ROW[r].timeHorizon}.`).join("\n")}\n\nNext: put that question to the user, then call choose_mentor_coach_or_advisor again with a sharper situation that includes the answer.`;
	}

	const lean = leaders[0];
	const row = ROLE_ROW[lean];
	const others = roles
		.filter((r) => r !== lean)
		.map((r) => `${r}: ${ROLE_ROW[r].brings}`)
		.join(" | ");
	const nextFor: Record<Role, string> = {
		Mentor: mentorNext(s),
		Coach: "call estimate_coaching_cost to price a coach fairly, and ask the user whether they still want someone who has done the job (that is a mentor).",
		Advisor:
			"the user is likely not buying mentoring: call build_mentoring_business_case only if they need the company to pay for it, otherwise estimate_coaching_cost to price an advisory engagement.",
	};
	const out = [
		`Lean: ${lean}. Their wording ("${s}") matches ${hits[lean]} ${lean.toLowerCase()} cue${hits[lean] === 1 ? "" : "s"} and no stronger signal for the others.`,
		`${row.role}: ${row.brings}. Typical question: "${row.typicalQuestion}" Domain experience: ${row.domainExperience}. Time horizon: ${row.timeHorizon}.`,
		`Not this: ${others}.`,
		`Heads-up: this is a lean from keywords in one sentence, not a verdict. ${FLIP[lean]}`,
	];
	if (lean === "Mentor") out.push(MENTOR_VS_COACH.context);
	out.push(`Next: ${nextFor[lean]}`);
	return out.join("\n\n");
}

// ─── Playbooks and first-time-manager guidance ─────────────────────────────

const PLAYBOOK_NEXT: Record<PlaybookSituation, string> = {
	"first-session":
		'the user sends the two definition-of-success questions as action items after session one. If they are a new manager, call get_first_time_manager_guidance. Ask the user: who do they report to, and has a 3-month definition of success been agreed?',
	underperformance:
		'ask the user: has this person been boosted before anyone talks about rotation? If not, that comes first. Then call get_engineering_leadership_benchmarks with topic = "team-health-thresholds" to put the delivery gap in numbers.',
	"promotion-to-manager":
		"call assess_team_lead_readiness (no arguments returns the 17 questions) and have the candidate answer them before the title changes. Ask the user: has a 3-month definition of success been written down?",
	"better-one-on-ones":
		'call get_engineering_leadership_benchmarks with topic = "team-health-thresholds" for the 10-15% manager time per report cap. Ask the user: how many direct reports, and what share of their 1:1s is status?',
	"career-move":
		"ask the user to answer the ten questions in writing. If question 3 is the sticking point (love coding or ready to lead), call assess_team_lead_readiness; to price the move call calculate_engineering_manager_value.",
};

export function renderPlaybook(situation: PlaybookSituation): string {
	const p = PLAYBOOKS[situation];
	return `${p.title}\n\n${p.body}\n\nNext: ${PLAYBOOK_NEXT[situation]}`;
}

export function renderFirstTimeManager(): string {
	return `First-time engineering manager: pick two of leadership, processes and delivery, and say out loud which one you are leaving room for.\n\nThe EM responsibility triangle:\n${EM_READINESS.triangle}\n\nMost common first-time-manager failure modes:\n${EM_READINESS.failureModes.map((f) => `- ${f}`).join("\n")}\n\nReadiness self-check before taking the role:\n${EM_READINESS.readinessQuestions.map((q) => `- ${q}`).join("\n")}\n\nThe first months:\n${EM_READINESS.firstMonths}\n\nNext: ask the user which two of the three corners their role really needs, then call get_one_on_one_playbook with situation = "better-one-on-ones" for the 1:1 habit, or assess_team_lead_readiness if they are still deciding whether to take the role. If they are already in the seat, calculate_engineering_manager_value shows which pillar to build first.`;
}

// ─── Coaching cost ─────────────────────────────────────────────────────────

export function coachingCostNext(): string {
	return "ask the user what the coach quoted. Below the range, check the seniority claimed; above it, they are paying brand or agency margin. If the cost has to be approved by a company, call build_mentoring_business_case with their role.";
}
