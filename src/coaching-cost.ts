// Coaching cost estimator — mirrors the live tool at marian.coach/coaching-cost-calculator/.
// Anchors: ICF Global Coaching Study 2025 (234 USD/hr global avg, 297 NA, ~293 WE),
// Tandem Coach 2026 credential bands (ACC 150-300, PCC 300-600, MCC 500-1000 USD),
// Leaders Adapt 2026 (CEO-only specialists 1,500-3,000+ USD),
// Czech market survey 2026 (managers 120-245 EUR, C-level 180-330 EUR).

export const CC_TYPES = ["executive", "leadership", "engineering-leadership", "career", "life"] as const;
export const CC_ROLES = ["ic", "em", "director", "vp", "founder"] as const;
export const CC_TERRITORIES = ["us", "uk", "western-europe", "cee", "online"] as const;
export const CC_COACH_LEVELS = ["certified", "experienced", "top-tier", "practitioner-mentor"] as const;
export const CC_SCOPES = ["single-session", "monthly", "quarter", "half-year"] as const;

type CcType = (typeof CC_TYPES)[number];
type CcRole = (typeof CC_ROLES)[number];
type CcTerritory = (typeof CC_TERRITORIES)[number];
type CcCoachLevel = (typeof CC_COACH_LEVELS)[number];
type CcScope = (typeof CC_SCOPES)[number];

const COACH_BANDS: Record<CcCoachLevel, { lo: number; hi: number; label: string }> = {
	certified: { lo: 150, hi: 300, label: "Certified, early career (ICF ACC level)" },
	experienced: { lo: 300, hi: 600, label: "Experienced (ICF PCC, 10+ yrs)" },
	"top-tier": { lo: 500, hi: 1000, label: "Top tier (MCC / C-suite specialist)" },
	"practitioner-mentor": { lo: 250, hi: 500, label: "Practitioner-mentor (held the role)" },
};

const TERRITORY: Record<CcTerritory, { mult: number; cur: string; label: string }> = {
	us: { mult: 1.0, cur: "USD", label: "United States" },
	uk: { mult: 0.7, cur: "GBP", label: "United Kingdom" },
	"western-europe": { mult: 0.8, cur: "EUR", label: "Western Europe" },
	cee: { mult: 0.45, cur: "EUR", label: "Central & Eastern Europe" },
	online: { mult: 0.75, cur: "EUR", label: "Online / anywhere" },
};

const ROLE_MULT: Record<CcRole, number> = { ic: 0.85, em: 0.95, director: 1.0, vp: 1.15, founder: 1.3 };
const ROLE_LABEL: Record<CcRole, string> = {
	ic: "IC / Senior engineer",
	em: "Team Lead / EM",
	director: "Director / Head of",
	vp: "VP / CTO",
	founder: "Founder / CEO",
};

const TYPE_MULT: Record<CcType, number> = {
	executive: 1.1,
	leadership: 1.0,
	"engineering-leadership": 1.05,
	career: 0.7,
	life: 0.55,
};
const TYPE_LABEL: Record<CcType, string> = {
	executive: "Executive coaching",
	leadership: "Leadership coaching",
	"engineering-leadership": "Engineering leadership mentoring",
	career: "Career coaching",
	life: "Life coaching",
};

const SCOPE: Record<CcScope, { sessions: number; discount: number; label: string }> = {
	"single-session": { sessions: 1, discount: 1.0, label: "Single session" },
	monthly: { sessions: 2, discount: 0.95, label: "Monthly (2 sessions/mo)" },
	quarter: { sessions: 6, discount: 0.85, label: "One quarter (6 sessions)" },
	"half-year": { sessions: 12, discount: 0.8, label: "6 months (12 sessions)" },
};

const round10 = (n: number) => Math.round(n / 10) * 10;

export function estimateCoachingCost(input: {
	coaching_type: CcType;
	client_role: CcRole;
	territory: CcTerritory;
	coach_seniority: CcCoachLevel;
	scope?: CcScope;
}): string {
	const band = COACH_BANDS[input.coach_seniority];
	const t = TERRITORY[input.territory];
	const scope = SCOPE[input.scope ?? "single-session"];
	const m = t.mult * ROLE_MULT[input.client_role] * TYPE_MULT[input.coaching_type];
	const perLo = round10(band.lo * m * scope.discount);
	const perHi = round10(band.hi * m * scope.discount);

	const lines = [
		`Fair coaching rate estimate`,
		``,
		`- Coaching type: ${TYPE_LABEL[input.coaching_type]}`,
		`- Client role: ${ROLE_LABEL[input.client_role]}`,
		`- Coach territory: ${t.label}`,
		`- Coach seniority: ${band.label}`,
		`- Engagement: ${scope.label}`,
		``,
		`Fair range per 60-minute session: ${perLo.toLocaleString("en-US")} – ${perHi.toLocaleString("en-US")} ${t.cur}`,
	];
	if (scope.sessions > 1) {
		const totalLabel = input.scope === "monthly" ? "Per month (2 sessions)" : `${scope.label} total`;
		lines.push(
			`${totalLabel}: ${(perLo * scope.sessions).toLocaleString("en-US")} – ${(perHi * scope.sessions).toLocaleString("en-US")} ${t.cur}`,
		);
		lines.push(
			`Commitment discount applied: multi-session engagements run ${Math.round((1 - scope.discount) * 100)}% under the one-off rate.`,
		);
	}

	lines.push(
		``,
		`How to read it: below this range the coach is usually not the seniority claimed; above it you are paying brand or agency margin, not a different service.`,
	);
	if (input.coach_seniority === "top-tier" && input.client_role === "founder") {
		lines.push(
			`Note: CEO-only specialists quote 1,500–3,000+ USD/hr. That market exists, but outcomes do not scale with the scarcity branding.`,
		);
	}
	if (input.coaching_type === "engineering-leadership" && input.coach_seniority !== "practitioner-mentor") {
		lines.push(
			`Note: for engineering leadership, ICF credentials are silent on whether the coach ever ran an eng org — compare against the practitioner-mentor band (250–500 USD baseline) before paying credential rates.`,
		);
	}

	lines.push(
		``,
		`Sources: ICF Global Coaching Study 2025 (234 USD/hr global avg, 297 NA), Tandem Coach 2026 credential bands, Czech market survey 2026 (CEE managers 120–245 EUR, C-level 180–330 EUR).`,
		`One public reference point: engineering leadership mentoring at marian.coach runs 430 EUR/session pay-as-you-go, 361 EUR in a first-quarter pack, same rate company-sponsored.`,
	);

	return lines.join("\n");
}
