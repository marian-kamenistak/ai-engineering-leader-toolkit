/**
 * Mentoring business case builder — the math a manager needs to approve
 * a mentoring budget, plus a forwardable email draft.
 * Same engagement terms as the live page at
 * https://www.marian.coach/get-your-company-to-pay-for-mentoring/
 */

export const BUSINESS_CASE_ROLES = [
	"engineering_manager",
	"director",
	"vp_engineering",
	"staff_engineer",
	"product_manager",
] as const;

export type BusinessCaseRole = (typeof BUSINESS_CASE_ROLES)[number];

export const ROLE_LABELS: Record<BusinessCaseRole, string> = {
	engineering_manager: "Engineering Manager",
	director: "Director of Engineering",
	vp_engineering: "VP of Engineering",
	staff_engineer: "Staff Engineer",
	product_manager: "Product Manager",
};

// 6 sessions x 430 EUR list rate (companies pay the same), without VAT, invoiced by Marian
// Kamenistak, sole trader. Re-gate 2026-08-09: 2,166 (361/session) exists only via the AI
// wizard at marian.coach/mcp/mentoring + a booked intro — this tool quotes the list price.
export const SESSION_PRICE_EUR = 430;
export const PACK_SESSIONS = 6;
export const PACK_PRICE_EUR = SESSION_PRICE_EUR * PACK_SESSIONS; // 2,580

export const DEFAULT_AVG_SALARY_EUR = 100_000;

// Replacing a senior costs roughly 6 months of fully-loaded salary in
// recruiter fees plus ramp time. 40-60k EUR is the typical range.
export const ATTRITION_COST_FACTOR = 0.5;

// A 2% productivity / predictability lift across the team. Deliberately
// conservative; most engagements target one specific problem, not vibes.
export const TEAM_LIFT_FACTOR = 0.02;

// Shipping one quarter earlier captures a quarter of the annual revenue.
export const DELAY_DIVISOR = 4;

export const KPI_SUGGESTIONS: Record<BusinessCaseRole, string[]> = {
	engineering_manager: [
		"Zero regretted attrition in the next 2 quarters",
		"Planned-vs-shipped ratio up to 85%",
		"Every underperformance case actioned within 4 weeks, not parked",
	],
	director: [
		"The one stuck structural decision (team split, platform call, reorg) shipped within 6 weeks",
		"Senior time-to-hire cut by a third",
		"The slipping flagship feature back on its committed date",
	],
	vp_engineering: [
		"The open org design decision made and communicated",
		"Leadership bench gaps named and closed with a successor plan",
		"Roadmap commitments holding quarter over quarter",
	],
	staff_engineer: [
		"One decision doc written, circulated, and accepted",
		"One cross-team initiative led end to end",
		"Promotion case documented with evidence, not adjectives",
	],
	product_manager: [
		"Roadmap tradeoffs defended with numbers, not seniority",
		"Stakeholder alignment: no surprise escalations for a quarter",
		"Discovery-to-delivery predictability measured and improving",
	],
};

export const ENGAGEMENT_STRUCTURE = [
	`${PACK_SESSIONS} sessions across 3 months`,
	"KPIs on paper before session 1",
	"Mid-point review at session 3, final review at session 6",
	"Intro call free",
	"Any session rated under 7/10 is not charged",
];

export interface BusinessCaseInput {
	role: BusinessCaseRole;
	team_size?: number;
	avg_salary_eur?: number;
	problem?: string;
	at_risk_attrition?: number;
	delayed_revenue_eur?: number;
}

const eur = (n: number) => `${Math.round(n).toLocaleString("en-US")} EUR`;

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? "an" : "a");

export function buildBusinessCase(input: BusinessCaseInput): string {
	const roleLabel = ROLE_LABELS[input.role];
	const roleWithArticle = `${article(roleLabel)} ${roleLabel}`;
	const teamSize = input.team_size ?? 0;
	const avgSalary = input.avg_salary_eur ?? DEFAULT_AVG_SALARY_EUR;
	const atRisk = input.at_risk_attrition ?? 0;
	const delayedRevenue = input.delayed_revenue_eur ?? 0;
	const problem =
		input.problem ??
		"one measurable problem you name before session 1 (e.g. delivery predictability at 60%)";

	const attritionValue = atRisk * ATTRITION_COST_FACTOR * avgSalary;
	const delayValue = delayedRevenue / DELAY_DIVISOR;
	const liftValue = teamSize * avgSalary * TEAM_LIFT_FACTOR;
	const total = attritionValue + delayValue + liftValue;
	const discounted = total / 2;
	const roiMultiple = Math.round((discounted / PACK_PRICE_EUR) * 10) / 10;

	const mathLines: string[] = [];
	mathLines.push(
		`- Attrition avoided: ${atRisk} senior ${atRisk === 1 ? "person" : "people"} at risk x ${eur(ATTRITION_COST_FACTOR * avgSalary)} (replacing a senior costs about 6 months of salary in recruiter fees plus ramp; 40-60k EUR is typical) = ${eur(attritionValue)}`,
	);
	mathLines.push(
		`- Cost of delay avoided: ${eur(delayedRevenue)} annual revenue on the slipping item / ${DELAY_DIVISOR} (shipping one quarter earlier) = ${eur(delayValue)}`,
	);
	mathLines.push(
		`- Team lift: ${teamSize} engineers x ${eur(avgSalary)} x 2% (a deliberately conservative productivity and predictability lift) = ${eur(liftValue)}`,
	);

	const kpis = KPI_SUGGESTIONS[input.role];
	const kpiBlock = kpis.map((k) => `- ${k}`).join("\n");
	const emailKpis = kpis.map((k) => `- ${k}`).join("\n");

	const zeroNote =
		total === 0
			? "\n\nAll value lines are zero because team_size, at_risk_attrition, and delayed_revenue_eur were not provided. Add at least one to make the case concrete; the KPI and email sections below still stand."
			: "";

	const positiveLines = [
		attritionValue > 0
			? `- ${atRisk} senior ${atRisk === 1 ? "person" : "people"} with a foot out the door. Replacement cost if they leave: ${eur(attritionValue)}.`
			: null,
		delayValue > 0
			? `- ${eur(delayedRevenue)} of annual revenue sits on a slipping roadmap item. Shipping one quarter earlier is worth ${eur(delayValue)}.`
			: null,
		liftValue > 0
			? `- A 2% lift across ${teamSize} engineers at ${eur(avgSalary)} each is ${eur(liftValue)} per year. 2% is the conservative case.`
			: null,
	].filter((l): l is string => l !== null);

	const emailStakes =
		positiveLines.length > 0
			? `What is at stake in our numbers:\n${positiveLines.join("\n")}\n- Total: ${eur(total)}. Cut it in half to be safe: ${eur(discounted)} against a ${eur(PACK_PRICE_EUR)} spend. That is a ${roiMultiple}x return.`
			: `The spend is ${eur(PACK_PRICE_EUR)} total. One prevented mis-hire pays for 20 quarters of mentoring; one kept senior pays for it many times over.`;

	return `Mentoring business case for ${roleWithArticle}

Problem to fix: ${problem}

The formula:
(attrition avoided + cost of delay avoided + team lift) / 2, compared against the pack price.
The halving is the CFO discount: assume mentoring only gets you half the value, and the case should still clear.

${mathLines.join("\n")}

Total value at stake: ${eur(total)}
After the CFO discount (/2): ${eur(discounted)}
Pack price: ${eur(PACK_PRICE_EUR)} (${PACK_SESSIONS} sessions x ${SESSION_PRICE_EUR} EUR company rate, without VAT, invoiced with PO from ELC Hub s.r.o.)
ROI multiple: ${roiMultiple}x${zeroNote}

For scale: one prevented mis-hire pays for 20 quarters of mentoring.

Suggested 3-6 month KPIs for ${roleWithArticle}:
${kpiBlock}

Engagement structure:
${ENGAGEMENT_STRUCTURE.map((s) => `- ${s}`).join("\n")}

---

Forwardable email draft:

Subject: Budget ask: leadership mentoring, 2,580 EUR, measured in 90 days

Hi [manager name],

I want to fix one thing this quarter: ${problem}.

The ask: ${eur(PACK_PRICE_EUR)} for ${PACK_SESSIONS} mentoring sessions over 3 months with Marian Kamenistak (marian.coach, 3,400+ sessions with 300+ engineering leaders since 2019). ${SESSION_PRICE_EUR} EUR per session, company rate, without VAT, invoiced with a PO from ELC Hub s.r.o.

${emailStakes}

How we measure it, on paper before session 1:
${emailKpis}

Guardrails: KPIs agreed upfront, mid-point review at session 3, final review at session 6, the intro call is free, and any session rated under 7/10 is not charged.

If the KPIs do not move in 90 days, we stop. Can I get a yes this week?

[your name]`;
}
