/**
 * Content embedded from marian.coach — published pages only, no invented numbers.
 * Sources:
 *   https://www.marian.coach/engineering-leadership-statistics/  (CC BY 4.0)
 *   https://www.marian.coach/mentor-vs-coach/
 */

export const SITE = "https://www.marian.coach";

export const ATTRIBUTION = (path: string) =>
	`\n\n—\nSource: Marian Kamenistak, marian.coach. 3,611 paid 1:1 mentoring sessions with 300+ engineering leaders since 2019.\n${SITE}${path}?ref=mcp\nYour situation is messier than any tool. Talk it through with Marian, 30 min, free: ${SITE}/meet?ref=mcp`;

export const BENCHMARKS = {
	practice: [
		"3,611 paid 1:1 mentoring sessions since 2019",
		"300+ engineering leaders mentored, leading teams in 17+ countries",
		"74% of clients come from referrals",
		"9.2/10 NPS across the mentoring practice; 4.9/5 average rating across 300 reviews",
	],
	menteeSeniorityMix: {
		headline: "52% of mentees are in their first leadership role when they start.",
		mix: [
			"Line managers (EMs, team leads) — 27%",
			"Mid-level leaders (senior EMs, heads of) — 23%",
			"Product leaders (PMs, CPOs) — 20%",
			"Top managers (VPs, CTOs, directors) — 20%",
			"ICs moving into leadership — 10%",
		],
	},
	topicDemand2025: [
		{
			bucket: "Team and people — the humans reporting to you",
			top3: [
				"Boosting an underperformer instead of rotating them",
				"Team audit and roadmap to high performance",
				"Hiring the right person for the mission ahead",
			],
		},
		{
			bucket: "Delivery and org — moving the machine without breaking it",
			top3: [
				"Goals and KPIs that survive Q3",
				"Shipping 80%+ of the roadmap, consistently",
				"Prioritizing when every stakeholder wants everything",
			],
		},
		{
			bucket: "Career — where the leader goes next",
			top3: [
				"Negotiating promotion, salary, or bonus with receipts",
				"Management vs Staff+ track decision",
				"First 90 days as a first-time Staff, EM, or CTO",
			],
		},
		{
			bucket: "The human behind the role — what runs when the laptop closes",
			top3: [
				"A daily routine that survives the calendar",
				"Imposter syndrome as a first-time leader",
				"Burnout recovery while keeping the job",
			],
		},
	],
	timeToResults:
		"Most mentees hit their first big milestone in 4 to 6 sessions — at the usual cadence, 2 to 3 months.",
	scene: "Engineering Leaders Community (founded 2019): 2,000+ members, 12 meetups a year with 120+ leaders in the room, annual conference with 500+ attendees and speakers from Netflix and Stripe.",
	background:
		"24 years in software; engineering org at Mews built through Series C from 8 to 80 teams; leadership at Manta before the IBM acquisition; 35+ fractional CTO projects; advised companies with a combined portfolio of $7.1bn.",
	citation:
		"Kamenistak, M. (2026). Engineering Leadership Mentoring Statistics 2026. marian.coach. https://www.marian.coach/engineering-leadership-statistics/ (CC BY 4.0; data source: the practice's own session log since 2019 + 300 collected post-engagement reviews — no survey panels, no scraped data; numbers rounded down, never up)",
};

export const MENTOR_VS_COACH = {
	roles: [
		{
			role: "Mentor",
			brings: "Transfers experience — sat in your seat, shortens trial-and-error",
			typicalQuestion: "How do I actually do this? What worked when you faced it?",
			domainExperience: "Required — a mentor without the scars is a podcast",
			timeHorizon: "Months. Milestone every 4-6 sessions",
		},
		{
			role: "Coach",
			brings: "Builds clarity — asks questions, no domain background needed",
			typicalQuestion: "What do I actually want? What is holding me back?",
			domainExperience: "Not required",
			timeHorizon: "Open-ended, reflection-driven",
		},
		{
			role: "Advisor",
			brings: "Serves the company — recommends what the org should do, signs their name",
			typicalQuestion: "What should the company do here?",
			domainExperience: "Required, org-level",
			timeHorizon: "Engagement-scoped",
		},
	],
	threeQuestionTest: [
		"1. Do you need a move or a mirror? A concrete move → mentor. A mirror to think out loud → coach.",
		"2. Is the problem yours or the company's? The company's → advisor or fractional CTO.",
		"3. Would domain scars change the answer? Yes → mentoring.",
	],
	// The 52% is a DERIVED figure and was computed at the old 3,400+ denominator; it has NOT been
	// recomputed at 3,611. The registry still publishes it, so it stands until that says otherwise
	// — the same call the ELC toolkit made for its 69/21 segments when members moved 3,100 → 3,300.
	// Do not silently recompute a derived percentage just because its denominator label moved.
	context:
		"In 3,611 sessions since 2019, 52% of mentees arrived in their first leadership role.",
};
