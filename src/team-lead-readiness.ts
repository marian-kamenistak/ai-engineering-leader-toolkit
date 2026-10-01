/**
 * Team lead readiness test — same questions, scoring, and verdict logic as
 * the live tool at https://www.marian.coach/team-lead-readiness-test/
 * 17 questions across 6 dimensions; each answer carries 0-3 points.
 * Dimension score = points / max points * 10. Verdict: ready now,
 * 6-12 months out, or stay IC — plus the caller's top-2 gap dimensions,
 * each with one concrete move.
 *
 * Input choice (documented): the tool takes per-question answers keyed by
 * question id (q1-q17), each an option index 0-3 into that question's
 * options — the same primitive the web page collects. Per-dimension
 * self-ratings were rejected because the page's option scores are
 * deliberately non-monotonic (e.g. "take the hard ticket myself" scores 1,
 * not 2) and a self-rating would bypass that calibration.
 */

export type TlrDim = "people" | "code" | "ownership" | "comms" | "why" | "org";

export const TLR_DIM_ORDER: TlrDim[] = ["people", "code", "ownership", "comms", "why", "org"];

// "org" is excluded from the core average: it gates ready-vs-months,
// it does not measure the person.
export const TLR_CORE_DIMS: TlrDim[] = ["people", "code", "ownership", "comms", "why"];

export const TLR_DIMS: Record<TlrDim, { label: string; action: string }> = {
	people: {
		label: "People appetite",
		action: "Book the honest conversation you have been postponing, this week. Feedback to a teammate counts. The lead job is mostly this, on repeat.",
	},
	code: {
		label: "Letting go of code",
		action: "Take the next hard ticket you want for yourself and give it away. Stay close, do not take it back. Practice the trade before the title forces it.",
	},
	ownership: {
		label: "Ownership beyond your tickets",
		action: "Ask to run the next sprint planning end to end. Start doing parts of the job before the title, that is how the title usually arrives.",
	},
	comms: {
		label: "Translation & saying no",
		action: "Take your last technical decision and write a 5-sentence summary a non-engineer would get. Send it to your PM and ask if it landed.",
	},
	why: {
		label: "Why you want this",
		action: "Write down why you want the role in one sentence with no salary and no title in it. If the sentence will not come, that is your answer, and it is a fine one. The IC track pays too.",
	},
	org: {
		label: "Org reality",
		action: "Tell your manager you want the lead path, in your next 1:1. Nobody hands an opening to someone who never asked for it.",
	},
};

export interface TlrQuestion {
	id: string;
	dim: TlrDim;
	text: string;
	// Option order matches the live page; scores are per option, 0-3,
	// deliberately not sorted (the calibration is part of the test).
	options: { text: string; score: number }[];
}

export const TLR_QUESTIONS: TlrQuestion[] = [
	{
		id: "q1",
		dim: "people",
		text: "Monday morning, your calendar shows four 1:1s this week. Honest reaction:",
		options: [
			{ text: "Looking forward to at least two of them", score: 3 },
			{ text: "Fine. Useful, not the highlight", score: 2 },
			{ text: "I would reschedule half if I could", score: 1 },
			{ text: "Quiet dread. Four hours gone", score: 0 },
		],
	},
	{
		id: "q2",
		dim: "people",
		text: "A teammate's work has been slipping for three weeks. What have you actually done?",
		options: [
			{ text: "Talked to them about it directly", score: 3 },
			{ text: "Helped with tickets, dropped hints", score: 2 },
			{ text: "Mentioned it to my manager", score: 1 },
			{ text: "Nothing. Not my call", score: 0 },
		],
	},
	{
		id: "q3",
		dim: "people",
		text: "Two engineers on your team disagree hard about an approach and the thread is turning sour. You:",
		options: [
			{
				text: "Get them in a room, make the disagreement explicit, drive to a decision",
				score: 3,
			},
			{ text: "Nudge one of them privately toward a compromise", score: 2 },
			{ text: "Wait. These things usually settle", score: 1 },
			{ text: "Mute the thread", score: 0 },
		],
	},
	{
		id: "q4",
		dim: "code",
		text: "Your coding time drops to 50% next quarter. In a year, maybe 20%. How does that read?",
		options: [
			{ text: "A fair trade for a bigger lever", score: 3 },
			{ text: "Acceptable, if the leadership work is real", score: 2 },
			{ text: "Uncomfortable. Code is my identity", score: 1 },
			{ text: "Dealbreaker", score: 0 },
		],
	},
	{
		id: "q5",
		dim: "code",
		text: "The hardest ticket of the sprint comes up. As a lead, you would:",
		options: [
			{ text: "Take it. I'm fastest and the deadline is real", score: 1 },
			{
				text: "Give it to the engineer who grows most from it, stay close",
				score: 3,
			},
			{ text: "Pair on it, then hand it over", score: 2 },
			{ text: "Take it, and the next one. Hard tickets are my thing", score: 0 },
		],
	},
	{
		id: "q6",
		dim: "code",
		text: "One hour left today. A full review queue, and a growth conversation a teammate asked for. You pick:",
		options: [
			{ text: "The conversation. Reviews can wait a day", score: 3 },
			{ text: "Split the hour, do both badly but visibly", score: 1 },
			{ text: "Reviews. Blocked PRs cost the whole team", score: 2 },
			{ text: "Reviews, and quietly hope they forget the conversation", score: 0 },
		],
	},
	{
		id: "q7",
		dim: "ownership",
		text: "Who ran your team's last sprint planning?",
		options: [
			{ text: "Me, mostly. It drifted to me and I kept it", score: 3 },
			{ text: "I run parts of it when asked", score: 2 },
			{ text: "I speak up on my own tickets", score: 1 },
			{ text: "I sit, estimate, and wait for it to end", score: 0 },
		],
	},
	{
		id: "q8",
		dim: "ownership",
		text: "A dependency on another team is about to slip your release. You:",
		options: [
			{ text: "Already talked to their lead before it became a fire", score: 3 },
			{ text: "Flag it loudly in the channel", score: 2 },
			{ text: "Tell my manager. Cross-team is their job", score: 1 },
			{ text: "My tickets are on track, so not my problem", score: 0 },
		],
	},
	{
		id: "q9",
		dim: "ownership",
		text: "The most junior person on your team. What is your actual relationship?",
		options: [
			{
				text: "I mentor them. Pairing, feedback, their growth is partly my problem",
				score: 3,
			},
			{ text: "I answer their questions when they come", score: 2 },
			{ text: "I review their PRs", score: 1 },
			{ text: "We share a standup", score: 0 },
		],
	},
	{
		id: "q10",
		dim: "comms",
		text: "Your PM asks why the migration takes three weeks, not three days. You:",
		options: [
			{
				text: "Translate it into risk and money. They get it in five minutes",
				score: 3,
			},
			{ text: "Explain it technically. They mostly trust me", score: 2 },
			{ text: 'Say "it\'s complicated" and link the epic', score: 1 },
			{ text: "Get annoyed. If they can't read code, that's their gap", score: 0 },
		],
	},
	{
		id: "q11",
		dim: "comms",
		text: 'A stakeholder asks for "one small extra thing" mid-sprint. You:',
		options: [
			{ text: "Say yes and quietly absorb it in evenings", score: 1 },
			{
				text: "Say no with an alternative: next sprint, or swap something out",
				score: 3,
			},
			{ text: "Escalate to my manager to say no for me", score: 2 },
			{ text: "Say yes and let the sprint slip", score: 0 },
		],
	},
	{
		id: "q12",
		dim: "comms",
		text: "Explaining a technical decision to sales, support, or the CEO usually goes:",
		options: [
			{ text: "I adjust the altitude. They leave with the right takeaway", score: 3 },
			{ text: "Fine, with prep and slides", score: 2 },
			{ text: "I over-explain and lose them", score: 1 },
			{ text: "I avoid those rooms", score: 0 },
		],
	},
	{
		id: "q13",
		dim: "why",
		text: "Be honest. The biggest pull toward the lead role is:",
		options: [
			{ text: "The salary bump and the title", score: 0 },
			{
				text: "Lately I care about the team doing well more than my own tickets",
				score: 3,
			},
			{ text: "A bigger lever on what gets built and how", score: 2 },
			{ text: "It feels like the expected next step at my tenure", score: 1 },
		],
	},
	{
		id: "q14",
		dim: "why",
		text: "A teammate you helped grow ships something great and gets the public praise. You feel:",
		options: [
			{ text: "Genuinely great. Their win is partly the point", score: 3 },
			{ text: 'Happy, plus a small sting of "that used to be me"', score: 2 },
			{ text: "Mostly the sting", score: 1 },
			{ text: "Why would I grow my own competition?", score: 0 },
		],
	},
	{
		id: "q15",
		dim: "why",
		text: "If leading paid the same as your senior IC path for the next two years, would you still want it?",
		options: [
			{ text: "Yes. The work is the point, not the bump", score: 3 },
			{ text: "Probably, if the growth comes later", score: 2 },
			{ text: "Hmm. That changes things", score: 1 },
			{ text: "No. The money was the point", score: 0 },
		],
	},
	{
		id: "q16",
		dim: "org",
		text: "Is there an actual team lead opening in reach?",
		options: [
			{ text: "Yes. My team needs a lead, or one opens within months", score: 3 },
			{ text: "Likely. The org is growing and my manager has hinted", score: 2 },
			{ text: "Unclear. Leads exist here, no opening in sight", score: 1 },
			{ text: "No. Flat org, the role does not exist here", score: 0 },
		],
	},
	{
		id: "q17",
		dim: "org",
		text: "Does your manager know you want this?",
		options: [
			{ text: "Yes, we talked about it, there is a plan", score: 3 },
			{ text: "They know. No plan yet", score: 2 },
			{ text: "I never said it out loud", score: 1 },
			{ text: "My manager barely runs their own 1:1s", score: 0 },
		],
	},
];

export type TlrVerdictKey = "ready" | "months" | "ic";

export const TLR_VERDICTS: Record<
	TlrVerdictKey,
	{ title: string; body: string; nextSteps: string }
> = {
	ready: {
		title: "Ready now.",
		body: "You are already doing parts of the job, the appetite is real, and a seat exists. That combination does not last: make the ask explicit before someone less ready and more vocal does. 52% of the leaders I mentor started exactly here, usually promoted for engineering skill and left alone with the people part. Do not skip your two gaps below, they are the part nobody will warn you about.",
		nextSteps:
			"Next steps: make the ask, then read the 30-60-90-day guide (https://www.marian.coach/blog/guide-to-leading-your-new-dev-team/) before day one. When the people part gets real, that is what 1:1 mentoring for new leads and EMs is for: https://www.marian.coach/engineering-manager-mentor/ — the intro session is free.",
	},
	months: {
		title: "6 to 12 months out.",
		body: "The direction is right, some muscles are not there yet, and that is the normal state before a first lead role. The difference between drifting into the title and walking into it is closing the two gaps below on purpose. Do the two moves, then re-take this test in a quarter.",
		nextSteps:
			"Next steps: the team lead role guide (https://www.marian.coach/blog/team-lead-role-vs-tech-lead-vs-engineering-manager/) shows what the three versions of the job actually own, and the 30-60-90-day guide (https://www.marian.coach/blog/guide-to-leading-your-new-dev-team/) shows what is coming. Want the gaps closed with someone who has watched this transition 300+ times? https://www.marian.coach/engineering-manager-mentor/",
	},
	ic: {
		title: "Stay IC. And that is fine.",
		body: "This is a track verdict, not a failure grade. Your answers say the people work would cost you more than it gives you, or the reason for wanting the title would not survive the first bad quarter. The senior IC track multiplies through influence instead of authority, and it pays. The worst outcome this test can prevent is you leading a team you never wanted to lead.",
		nextSteps:
			"Next steps: read what a staff engineer role is all about (https://www.marian.coach/blog/what-a-staff-engineer-role-is-all-about/) for the track you are choosing on purpose, and the team lead role guide (https://www.marian.coach/blog/team-lead-role-vs-tech-lead-vs-engineering-manager/) to know exactly what you are turning down. Weighing the two tracks live is a classic first mentoring session topic: https://www.marian.coach/engineering-manager-mentor/",
	},
};

// Dimension scores 0-10: points earned / points possible * 10
export function tlrDimScores(answers: Record<string, number>): Record<TlrDim, number> {
	const sum = {} as Record<TlrDim, number>;
	const max = {} as Record<TlrDim, number>;
	for (const d of TLR_DIM_ORDER) {
		sum[d] = 0;
		max[d] = 0;
	}
	for (const q of TLR_QUESTIONS) {
		max[q.dim] += 3;
		const idx = answers[q.id];
		if (typeof idx === "number" && q.options[idx]) {
			sum[q.dim] += q.options[idx].score;
		}
	}
	const out = {} as Record<TlrDim, number>;
	for (const d of TLR_DIM_ORDER) {
		out[d] = max[d] ? Math.round((sum[d] / max[d]) * 100) / 10 : 0;
	}
	return out;
}

// Verdict thresholds — identical to the live page:
// - salary/title-only motivation (why<=3) + low people appetite (people<=4)
//   => stay IC, whatever the rest says
// - core mean (5 personal dims) >= 7 => ready if org >= 5, else 6-12 months
// - core mean >= 4.5 => 6-12 months
// - else => stay IC
export function tlrVerdict(ds: Record<TlrDim, number>): TlrVerdictKey {
	let core = 0;
	for (const d of TLR_CORE_DIMS) core += ds[d];
	core = core / TLR_CORE_DIMS.length;
	if (ds.why <= 3 && ds.people <= 4) return "ic";
	if (core >= 7) return ds.org >= 5 ? "ready" : "months";
	if (core >= 4.5) return "months";
	return "ic";
}

// Top-2 gap dimensions: the two lowest-scoring of all 6
export function tlrTopGaps(ds: Record<TlrDim, number>): TlrDim[] {
	return [...TLR_DIM_ORDER].sort((a, b) => ds[a] - ds[b]).slice(0, 2);
}

export function tlrQuestionnaireText(): string {
	const byDim = TLR_DIM_ORDER.map((d) => {
		const qs = TLR_QUESTIONS.filter((q) => q.dim === d)
			.map(
				(q) =>
					`${q.id}. ${q.text}\n${q.options
						.map((o, i) => `   ${i}: ${o.text}`)
						.join("\n")}`,
			)
			.join("\n");
		return `## ${TLR_DIMS[d].label}\n${qs}`;
	}).join("\n\n");
	return byDim;
}
