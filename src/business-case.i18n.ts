/**
 * Business case v2 — string tables (EN + CS).
 *
 * The employee's voice, not marketing copy: they send this to their boss.
 * Rules baked in: one proof number in the email (3,400+ sessions), no invented
 * specifics (a missing input renders as a visible [bracket]), the invoicing
 * line names Marian Kamenistak as a sole trader (never ELC Hub s.r.o.), list
 * prices only (430 / 2,580 EUR — the 361/2,166 AI-channel price never appears here).
 * Czech: diacritics (web copy), tykání by default, `formal` = vykání; sentences
 * avoid gendered past-tense forms so they read right for anyone.
 */

import type { Alternative, BusinessCaseRole, Situation } from "./business-case";

/** A string that differs between tykání and vykání (Czech). EN entries are plain strings. */
export type F = string | { informal: string; formal: string };

export interface EmailStrings {
	subject: string;
	greeting: F; // uses {manager}
	greeting_fallback: F; // when no manager name given
	p1: F;
	p2: F;
	p3: F; // introduces the KPI list
	p4: F;
}

export interface Strings {
	roles: Record<BusinessCaseRole, string>;
	problem_examples: Record<BusinessCaseRole, string[]>;
	kpis: Record<BusinessCaseRole, string[]>;
	alternatives: Record<Alternative, string>;
	fallbacks: { manager: string; problem: string; decide_by: string; your_name: string; company: string };
	email: {
		ld_budget: EmailStrings;
		no_budget: EmailStrings;
		first_time: F; // {role}
		at_risk_1: F; // {n}
		at_risk_n: F; // {n}, 2-4 in Czech
		at_risk_5: F; // {n}, 5+ in Czech (EN reuses at_risk_n)
		p5: F;
		close: F; // {decide_by}
	};
	slack: { text: F; ask_line: Record<Situation, string>; budget_line: Record<Situation, string> };
	talking: { t1: string; t2: string; t3: string; t4_risk: string; t4_zero: string; t5: string };
	one_pager: {
		title: string;
		s_problem: string;
		s_success: string;
		s_what: string;
		what_body: Record<Situation, string>;
		s_investment: string;
		investment_rows: Record<Situation, [string, string][]>; // {company} in the invoiced-to row
		s_measure: string;
		measure_bullets: string[];
		s_risk: string;
		risk_bullets: string[];
		s_budget: string;
		budget_body: Record<Situation, string>;
		s_why_now: string;
		why_now_body: string; // {role}
		s_alternatives: string;
		alt_bullets: Record<Alternative, string>;
		alt_closing: string;
		s_math: string;
		math_risk_closing: string; // {discounted} {ask} {roi}
		math_zero_body: string; // {ask}
		s_give_back: string;
		give_back_body: string;
		s_decision: string;
		decision_body: string; // {decide_by}
	};
	objections: { objection: F; answer: F }[];
	evidence: { claim: string; source: string; url: string }[];
	engagement: string[];
	next_steps: string[];
	/** The four value lines + the CFO rule, as published on
	 * marian.coach/get-your-company-to-pay-for-mentoring/. Static framing, not computed. */
	value_formula: { heading: string; lines: string[]; rule: string };
	/** The three worked examples from the same page. Static, role-anchored, already public. */
	worked_examples: { role: string; setup: string; kpis: string; math: string }[];
	math: {
		attrition: string; // {n} {unit} {value}
		person: string;
		people: string;
		delay: string; // {rev} {value}
		lift: string; // {team} {sal} {value}
		cfo: string; // {discounted} {ask} {roi}
		note_zero: string; // {ask}
		note_pos: string; // {roi}
	};
	report: {
		title: string; // {your_name} {role}
		problem: string;
		math: string;
		one_pager: string;
		email: string;
		subject: string;
		slack: string;
		talking: string;
		objections: string;
		evidence: string;
		next_steps: string;
		engagement: string;
		value_formula: string;
		worked_examples: string;
	};
}

const ROLES_EN: Record<BusinessCaseRole, string> = {
	engineering_manager: "Engineering Manager",
	director: "Director of Engineering",
	vp_engineering: "VP of Engineering / CTO",
	staff_engineer: "Staff Engineer",
	product_manager: "Product Manager",
};

const EN: Strings = {
	roles: ROLES_EN,
	problem_examples: {
		engineering_manager: [
			"delivery predictability stuck around 60%",
			"two seniors I'm not sure we keep",
			"an underperformance case I've been parking for a quarter",
		],
		director: [
			"a team split / platform decision that's been open for two months",
			"senior time-to-hire over 90 days",
			"the flagship feature slipping a second quarter",
		],
		vp_engineering: [
			"an org design decision I keep postponing",
			"no successor for two of my leads",
			"roadmap commitments not holding quarter over quarter",
		],
		staff_engineer: [
			"a cross-team initiative nobody owns end to end",
			"a decision doc that keeps getting reopened",
			"a promotion case with adjectives instead of evidence",
		],
		product_manager: [
			"roadmap tradeoffs I lose to seniority, not numbers",
			"surprise escalations from stakeholders every sprint",
			"discovery-to-delivery predictability nobody measures",
		],
	},
	kpis: {
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
	},
	alternatives: { conference: "Conference", course: "Course", internal_coach: "Internal coach" },
	fallbacks: {
		manager: "[manager's name]",
		problem: "[the one problem I want fixed, e.g. delivery predictability stuck at 60%]",
		decide_by: "[Friday]",
		your_name: "[your name]",
		company: "the company",
	},
	email: {
		ld_budget: {
			subject: "Learning budget request: leadership mentoring, 2,580 EUR, reviewed at 90 days",
			greeting: "Hi {manager},",
			greeting_fallback: "Hi [manager's name],",
			p1: "I want to fix one thing in the next 90 days: {problem}. I'd like to use my learning budget on it.",
			p2: "The ask: 6 mentoring sessions over 3 months with Marian Kamenistak (marian.coach), an engineering leader who has run 3,400+ sessions with people in my role. 6 x 430 EUR = 2,580 EUR without VAT, invoiced to us by him as a sole trader, our PO number on the invoice.",
			p3: "What you'd see by session 6:",
			p4: "We put these on paper before session 1 and review them together at session 3 and session 6. The intro call is free, any session I rate under 7/10 isn't charged, and if the KPIs don't move in 90 days we stop.",
		},
		no_budget: {
			subject: "Budget ask: one 430 EUR mentoring session as a pilot, then we decide",
			greeting: "Hi {manager},",
			greeting_fallback: "Hi [manager's name],",
			p1: "I want to fix one thing in the next 90 days: {problem}. I'd rather test outside help on it before asking for a real budget, so this is a small ask.",
			p2: "The ask: one 60-minute session with Marian Kamenistak (marian.coach), an engineering leader who has run 3,400+ sessions with people in my role. 430 EUR without VAT, invoiced to us by him as a sole trader, our PO number on the invoice. If it's useful, the session counts toward a 6-session quarter (2,580 EUR) when I continue within 30 days. If it isn't, we've spent 430 EUR and I stop bringing it up.",
			p3: "What I'd bring back from the pilot: a written plan for {problem}, with the targets for the next 90 days:",
			p4: "The intro call is free and any session I rate under 7/10 isn't charged.",
		},
		first_time:
			"This is my first {role} seat. Most managers get their first leadership training about a decade after they start leading people (HBR / Zenger Folkman). I'd rather not run that experiment on this team.",
		at_risk_1:
			"One more number: we have {n} senior person I'm not sure we keep. Replacing one costs 40 to 60k EUR. This costs 2,580.",
		at_risk_n:
			"One more number: we have {n} senior people I'm not sure we keep. Replacing one costs 40 to 60k EUR. This costs 2,580.",
		at_risk_5:
			"One more number: we have {n} senior people I'm not sure we keep. Replacing one costs 40 to 60k EUR. This costs 2,580.",
		p5: "Pricing is public at marian.coach/pricing/. I'll write up what I learn for the team.",
		close: "Can I get a yes by {decide_by}?",
	},
	slack: {
		text: "{manager}, quick one. I want to fix one thing in the next 90 days: {problem}. I'd like to use {budget_line} for 1:1 mentoring with Marian Kamenistak (marian.coach): {ask_line}. Targets on paper before session 1, review at 3 and 6, any session I rate under 7/10 isn't charged. Sending you a one-pager with the numbers. Ok to decide by {decide_by}?",
		ask_line: {
			ld_budget: "6 sessions over 3 months, 2,580 EUR",
			no_budget: "one 430 EUR session first, then we decide",
		},
		budget_line: { ld_budget: "my learning budget", no_budget: "a small pilot budget" },
	},
	talking: {
		t1: "The problem is {problem}. Fixed looks like: {kpis}.",
		t2: "This is 1:1 with someone who held my role, on my situation, not a course. {ask_line}.",
		t3: "Risk is capped: free intro call, sessions under 7/10 aren't charged, review at session 3, stop at 90 days if nothing moves.",
		t4_risk:
			"Money: replacing one of the {n} seniors we might lose costs 40 to 60k EUR. This is {ask_eur} EUR.",
		t4_zero:
			"Money: one prevented departure or one quarter of roadmap slip pays for it 15 times over.",
		t5: "I'll write up what I learn for the team, and the invoice goes to us with our PO number.",
	},
	one_pager: {
		title: "Mentoring engagement proposal: {your_name}, {role}",
		s_problem: "The problem to fix in the next 90 days",
		s_success: "What success looks like by session 6",
		s_what: "What it is",
		what_body: {
			ld_budget:
				"6 one-hour 1:1 sessions over 3 months, plus async access between sessions, with Marian Kamenistak (marian.coach). Engineering leader; scaled engineering at Mews from 8 to 80 teams through Series C; 3,400+ mentoring sessions with 300 leaders since 2019; rated 9.17/10 across 300+ reviews.",
			no_budget:
				"Pilot: one 60-minute 1:1 session with Marian Kamenistak (marian.coach). Engineering leader; scaled engineering at Mews from 8 to 80 teams through Series C; 3,400+ mentoring sessions with 300 leaders since 2019; rated 9.17/10 across 300+ reviews. If continued within 30 days, the session counts toward the 6-session quarter.",
		},
		s_investment: "Investment",
		investment_rows: {
			ld_budget: [
				["6 sessions x 430 EUR", "2,580 EUR without VAT"],
				["Intro call", "free"],
				["Invoiced to", "{company} by Marian Kamenistak (sole trader), PO number on the invoice"],
				["Payment", "on invoice"],
			],
			no_budget: [
				["Pilot: 1 session", "430 EUR without VAT"],
				["If continued within 30 days", "counts toward the 6-session quarter, 2,580 EUR total"],
				["Intro call", "free"],
				["Invoiced to", "{company} by Marian Kamenistak (sole trader), PO number on the invoice"],
				["Payment", "on invoice"],
			],
		},
		s_measure: "How we measure it",
		measure_bullets: [
			"Targets on paper before session 1, baseline written down",
			"Review with my manager at session 3",
			"Final review at session 6",
			"Stop clause: no movement in 90 days, we stop",
		],
		s_risk: "Risk controls",
		risk_bullets: [
			"Intro call is free",
			"Any session rated under 7/10 isn't charged",
			"Public pricing: marian.coach/pricing/",
		],
		s_budget: "Budget source",
		budget_body: {
			ld_budget: "Learning & development budget, individual allocation.",
			no_budget: "Discretionary team budget; one session as a pilot before any larger ask.",
		},
		s_why_now: "Why now",
		why_now_body:
			"First {role} seat. HBR / Zenger Folkman (2012): the average manager gets first leadership training at 42, about a decade after starting to lead people. CEB/Gartner: about 60% of new managers underperform or fail in their first two years.",
		s_alternatives: "Alternatives considered",
		alt_bullets: {
			conference: "Conference: similar money, two days of talks, no follow-through on my problem.",
			course: "Course: cheaper, generic, no accountability.",
			internal_coach:
				"Internal mentor or coach: free, but inside my reporting line, so the messy version of the problem doesn't get said.",
		},
		alt_closing:
			"1:1 on my problem with targets and a stop clause is the cheapest of these per outcome.",
		s_math: "Napkin math",
		math_risk_closing:
			"Halved to be safe: {discounted} EUR against {ask} EUR = {roi}x.",
		math_zero_body:
			"Replacing one senior engineer costs 40 to 60k EUR (Gallup: one-half to two times salary). This costs {ask} EUR. One prevented departure or one quarter of roadmap slip pays for it 15 times over.",
		s_give_back: "What I give back",
		give_back_body: "A written summary for the team after session 6.",
		s_decision: "Decision requested by",
		decision_body:
			"{decide_by}. Next step: I book the free intro call and bring back the plan for sign-off.",
	},
	objections: [
		{
			objection: "There's no budget for this.",
			answer:
				"Most companies keep an L&D or conference line per person; this is what it's for. If ours is spent, I can start with one 430 EUR session and we decide after, or we split it across two quarters.",
		},
		{
			objection: "Why not our internal coach or a senior colleague?",
			answer:
				"I'll use them too. This is someone who ran engineering at scale and sits outside my reporting line, so I can bring the messy version of the problem. Two different tools.",
		},
		{
			objection: "Why not a course or a conference?",
			answer:
				"A course covers the general case; my problem is specific and has a deadline. The sessions are on my actual situation, with targets we agreed. And it's cheaper than one recruiter fee.",
		},
		{
			objection: "How do we know it works?",
			answer:
				"Targets on paper before session 1, review at session 3 and 6, sessions I rate under 7/10 aren't charged, and we stop at 90 days if nothing moves. That's more measurement than most training gets.",
		},
		{
			objection: "What if you leave after we pay for it?",
			answer:
				"People usually leave when they stall in a role, not after someone invests in them. This is about doing this job better here, and I'll write up what I learn for the team.",
		},
	],
	evidence: [
		{
			claim: "Replacing an employee costs one-half to two times their annual salary.",
			source: "Gallup, 2019",
			url: "https://www.gallup.com/workplace/247391/fixable-problem-costs-businesses-trillion.aspx",
		},
		{
			claim: "Average age at first leadership training: 42, about a decade after first supervising people.",
			source: "HBR / Zenger Folkman, 2012",
			url: "https://hbr.org/2012/12/why-do-we-wait-so-long-to-trai",
		},
		{
			claim: "About 60% of new managers underperform or fail in their first two years.",
			source: "CEB / Gartner (secondary citation)",
			url: "https://www.forbes.com/sites/williamarruda/2023/02/15/why-most-new-managers-fail-and-how-to-prevent-it/",
		},
		{
			claim: "Meta-analysis of 39 randomised samples: workplace coaching has a moderate, replicated positive effect.",
			source: "De Haan & Nilsson, Academy of Management Learning & Education, 2023",
			url: "https://journals.aom.org/doi/10.5465/amle.2022.0107",
		},
		{
			claim: "3,400+ sessions, 300 leaders since 2019, rated 9.17/10 across 300+ reviews.",
			source: "marian.coach",
			url: "https://www.marian.coach/engineering-leadership-statistics/",
		},
	],
	engagement: [
		"6 sessions across 3 months",
		"Targets on paper before session 1",
		"Review at session 3, final review at session 6",
		"Intro call free",
		"Any session rated under 7/10 is not charged",
	],
	next_steps: [
		"Send the email first, then ask for 15 minutes",
		"Bring the one-pager to the conversation, leave it with them to forward",
		"Book the free intro call once you have a yes: https://www.marian.coach/meet",
		"Invoice goes to your company with your PO number",
	],
	value_formula: {
		heading: "What the mentoring is worth over 6 months, added up from four lines",
		lines: [
			"Money saved: attrition prevented, mis-hires avoided, firefighting hours cut",
			"Cost of delay avoided: roadmap items shipping on time instead of a quarter late",
			"Missed opportunity recovered: the initiative nobody had bandwidth to lead",
			"Roadmap slippage avoided: commitments that hold, planned vs shipped",
		],
		rule: "Count only the lines you can defend in front of a CFO, then halve the total. If it still clears the ask several times over, send it. Managers approve numbers with a review date, rarely feelings.",
	},
	worked_examples: [
		{
			role: "Engineering Manager, team of 8",
			setup: "Fully loaded team cost around 800,000 EUR a year. One senior engineer has a foot out the door and delivery predictability sits near 60%.",
			kpis: "Regretted attrition zero, planned-vs-shipped from 60% to 85%, the open underperformance case actioned within 4 weeks.",
			math: "Counting only the retention line: replacing that senior costs 40 to 60k EUR, the pack costs 2,580 EUR. One prevented departure pays for the mentoring 15 times over.",
		},
		{
			role: "Director, 3 teams, 24 engineers",
			setup: "A reorg decision has been stuck for two quarters, and the flagship feature with roughly 300,000 EUR of annual revenue attached is slipping with it.",
			kpis: "Reorg decided and shipped within 6 weeks, the feature back on its committed date, both open senior roles closed.",
			math: "Counting only cost of delay: shipping one quarter earlier on a 300,000 EUR revenue line is worth about 75,000 EUR. Halved for CFO skepticism, that is 37,000 against 2,580. Still 14x.",
		},
		{
			role: "Staff Engineer",
			setup: "A build-vs-buy platform decision with 100,000+ EUR a year riding on it, and influence that stops at the team boundary.",
			kpis: "The decision doc written, defended and accepted; one cross-team initiative led end to end; the promotion case documented.",
			math: "One platform choice gone wrong recurs every year at six figures, and replacing a staff engineer runs 6 to 9 months of salary. Either line alone beats the pack price by an order of magnitude.",
		},
	],
	math: {
		attrition:
			"Attrition avoided: {n} senior {unit} at risk x 50,000 EUR (replacing a senior costs 40 to 60k EUR; Gallup: one-half to two times salary) = {value} EUR",
		person: "person",
		people: "people",
		delay:
			"Cost of delay avoided: {rev} EUR annual revenue on the slipping item / 4 (one quarter earlier) = {value} EUR",
		lift: "Team lift: {team} engineers x {sal} EUR x 2% (a deliberately conservative lift) = {value} EUR",
		cfo: "Halved to be safe (the CFO discount): {discounted} EUR against {ask} EUR = {roi}x",
		note_zero:
			"No at-risk seniors given, so no total is claimed. Replacing one senior costs 40 to 60k EUR; against {ask} EUR one prevented departure pays for it 15 times over.",
		note_pos: "After halving, the case clears the ask {roi} times over.",
	},
	report: {
		title: "Mentoring business case for {your_name}, {role}",
		problem: "Problem to fix",
		math: "Napkin math",
		one_pager: "Manager one-pager (forwardable to finance)",
		email: "Forwardable email",
		subject: "Subject",
		slack: "Slack / Teams version",
		talking: "Talking points for the conversation",
		objections: "If they push back",
		evidence: "Sources",
		next_steps: "Next steps",
		engagement: "Engagement",
		value_formula: "How to size the value",
		worked_examples: "Worked examples",
	},
};

const CS: Strings = {
	roles: ROLES_EN,
	problem_examples: {
		engineering_manager: [
			"predictability dodávky se drží kolem 60 %",
			"dva senioři, u kterých hrozí, že odejdou",
			"underperformance case, který odkládám už kvartál",
		],
		director: [
			"rozdělení týmu / platformové rozhodnutí, které je otevřené dva měsíce",
			"time-to-hire seniorů přes 90 dní",
			"vlajková feature klouže druhý kvartál",
		],
		vp_engineering: [
			"org design rozhodnutí, které pořád odkládám",
			"žádný nástupce za dva z mých leadů",
			"roadmap commitmenty nedrží kvartál po kvartálu",
		],
		staff_engineer: [
			"cross-team iniciativa, kterou nikdo nevlastní od začátku do konce",
			"decision doc, který se pořád znovu otvírá",
			"promotion case s přídavnými jmény místo důkazů",
		],
		product_manager: [
			"roadmap tradeoffy, které prohrávám na senioritu, ne na čísla",
			"překvapivé eskalace od stakeholderů každý sprint",
			"predictability od discovery po delivery, kterou nikdo neměří",
		],
	},
	kpis: {
		engineering_manager: [
			"Nulová nechtěná fluktuace v příštích 2 kvartálech",
			"Poměr naplánováno vs. dodáno nad 85 %",
			"Každý underperformance case řešený do 4 týdnů, ne odložený",
		],
		director: [
			"Jedno zaseklé strukturální rozhodnutí (rozdělení týmu, platforma, reorg) hotové do 6 týdnů",
			"Time-to-hire seniorů kratší o třetinu",
			"Klouzající vlajková feature zpátky na slíbeném termínu",
		],
		vp_engineering: [
			"Otevřené org design rozhodnutí přijaté a odkomunikované",
			"Mezery v leadership bench pojmenované a zavřené plánem nástupnictví",
			"Roadmap commitmenty drží kvartál po kvartálu",
		],
		staff_engineer: [
			"Jeden decision doc napsaný, obeslaný a přijatý",
			"Jedna cross-team iniciativa vedená od začátku do konce",
			"Promotion case doložený důkazy, ne přídavnými jmény",
		],
		product_manager: [
			"Roadmap tradeoffy obhájené čísly, ne senioritou",
			"Sladění se stakeholdery: kvartál bez překvapivé eskalace",
			"Predictability od discovery po delivery měřená a rostoucí",
		],
	},
	alternatives: { conference: "Konference", course: "Kurz", internal_coach: "Interní kouč" },
	fallbacks: {
		manager: "[jméno šéfa]",
		problem: "[ta jedna věc, kterou chci vyřešit, např. predictability dodávky se drží na 60 %]",
		decide_by: "[pátek]",
		your_name: "[tvoje jméno]",
		company: "firmu",
	},
	email: {
		ld_budget: {
			subject:
				"Žádost o rozpočet na rozvoj: leadership mentoring, 2 580 EUR, vyhodnocení po 90 dnech",
			greeting: { informal: "{manager} ahoj,", formal: "Dobrý den, {manager}," },
			greeting_fallback: { informal: "Ahoj,", formal: "Dobrý den," },
			p1: "Chci v příštích 90 dnech vyřešit jednu konkrétní věc: {problem}. Chci na to použít svůj rozpočet na rozvoj.",
			p2: "O co jde: 6 mentoringových sessions během 3 měsíců s Marianem Kamenistakem (marian.coach), engineering leaderem, který má za sebou 3 400+ sessions s lidmi v mé roli. 6 x 430 EUR = 2 580 EUR bez DPH, fakturuje nám jako OSVČ, na faktuře bude naše číslo objednávky.",
			p3: { informal: "Co uvidíš do šesté session:", formal: "Co uvidíte do šesté session:" },
			p4: "Cíle dáme na papír před první session a společně je projdeme po třetí a po šesté. Intro call je zdarma, session, kterou ohodnotím pod 7/10, se neplatí, a když se KPI za 90 dní nepohnou, končíme.",
		},
		no_budget: {
			subject: "Žádost o rozpočet: jedna mentoringová session za 430 EUR jako pilot, pak se rozhodneme",
			greeting: { informal: "{manager} ahoj,", formal: "Dobrý den, {manager}," },
			greeting_fallback: { informal: "Ahoj,", formal: "Dobrý den," },
			p1: "Chci v příštích 90 dnech vyřešit jednu konkrétní věc: {problem}. Než budu žádat o skutečný rozpočet, chci si pomoc zvenku nejdřív vyzkoušet, takže je to malá žádost.",
			p2: "O co jde: jedna 60minutová session s Marianem Kamenistakem (marian.coach), engineering leaderem, který má za sebou 3 400+ sessions s lidmi v mé roli. 430 EUR bez DPH, fakturuje nám jako OSVČ, na faktuře bude naše číslo objednávky. Když to bude užitečné, session se započítá do kvartálu o 6 sessions (2 580 EUR), pokud budu pokračovat do 30 dnů. Když ne, stálo nás to 430 EUR a už to nebudu otvírat.",
			p3: "Co z pilotu přinesu: písemný plán na {problem} s cíli na příštích 90 dní:",
			p4: "Intro call je zdarma a session, kterou ohodnotím pod 7/10, se neplatí.",
		},
		first_time:
			"Je to moje první role jako {role}. Většina manažerů dostane první leadership trénink zhruba deset let po tom, co začne vést lidi (HBR / Zenger Folkman). Nechci ten experiment dělat na tomhle týmu.",
		at_risk_1:
			"Ještě jedno číslo: máme {n} seniora, u kterého hrozí, že odejde. Nahradit ho stojí 40 až 60 tisíc EUR. Tohle stojí 2 580.",
		at_risk_n:
			"Ještě jedno číslo: máme {n} seniory, u kterých hrozí, že odejdou. Nahradit jednoho stojí 40 až 60 tisíc EUR. Tohle stojí 2 580.",
		at_risk_5:
			"Ještě jedno číslo: máme {n} seniorů, u kterých hrozí, že odejdou. Nahradit jednoho stojí 40 až 60 tisíc EUR. Tohle stojí 2 580.",
		p5: "Ceník je veřejný na marian.coach/cs/cenik/. Co se naučím, sepíšu pro tým.",
		close: { informal: "Dostanu do {decide_by} ano?", formal: "Dostanu od Vás do {decide_by} ano?" },
	},
	slack: {
		text: {
			informal:
				"{manager}, rychlá věc. Chci v příštích 90 dnech vyřešit jednu věc: {problem}. Chci na to použít {budget_line} na 1:1 mentoring s Marianem Kamenistakem (marian.coach): {ask_line}. Cíle na papíře před první session, review po třetí a šesté, session pod 7/10 se neplatí. Pošlu ti jednostránkový podklad s čísly. Rozhodneme do {decide_by}?",
			formal:
				"{manager}, rychlá věc. Chci v příštích 90 dnech vyřešit jednu věc: {problem}. Chci na to použít {budget_line} na 1:1 mentoring s Marianem Kamenistakem (marian.coach): {ask_line}. Cíle na papíře před první session, review po třetí a šesté, session pod 7/10 se neplatí. Pošlu Vám jednostránkový podklad s čísly. Rozhodneme do {decide_by}?",
		},
		ask_line: {
			ld_budget: "6 sessions během 3 měsíců, 2 580 EUR",
			no_budget: "nejdřív jedna session za 430 EUR, pak se rozhodneme",
		},
		budget_line: { ld_budget: "svůj rozpočet na rozvoj", no_budget: "malý pilotní rozpočet" },
	},
	talking: {
		t1: "Problém: {problem}. Vyřešeno znamená: {kpis}.",
		t2: "Je to 1:1 s někým, kdo dělal mou roli, na mé konkrétní situaci, ne kurz. {ask_line}.",
		t3: "Riziko je omezené: intro call zdarma, session pod 7/10 se neplatí, review po třetí session, po 90 dnech končíme, když se nic nepohne.",
		t4_risk:
			"Peníze: nahradit jednoho z {n} seniorů, které můžeme ztratit, stojí 40 až 60 tisíc EUR. Tohle je {ask_eur} EUR.",
		t4_zero:
			"Peníze: jeden odchod, kterému předejdeme, nebo jeden kvartál skluzu na roadmapě to zaplatí patnáctkrát.",
		t5: "Co se naučím, sepíšu pro tým, a faktura jde na firmu s naším číslem objednávky.",
	},
	one_pager: {
		title: "Návrh mentoringu: {your_name}, {role}",
		s_problem: "Co chci vyřešit v příštích 90 dnech",
		s_success: "Jak vypadá úspěch do šesté session",
		s_what: "Co to je",
		what_body: {
			ld_budget:
				"6 hodinových 1:1 sessions během 3 měsíců plus async přístup mezi nimi, s Marianem Kamenistakem (marian.coach). Engineering leader; v Mews rozšířil engineering z 8 na 80 týmů přes Series C; 3 400+ mentoringových sessions se 300 leadery od roku 2019; hodnocení 9,17/10 z 300+ recenzí.",
			no_budget:
				"Pilot: jedna 60minutová 1:1 session s Marianem Kamenistakem (marian.coach). Engineering leader; v Mews rozšířil engineering z 8 na 80 týmů přes Series C; 3 400+ mentoringových sessions se 300 leadery od roku 2019; hodnocení 9,17/10 z 300+ recenzí. Při pokračování do 30 dnů se session započítá do kvartálu o 6 sessions.",
		},
		s_investment: "Investice",
		investment_rows: {
			ld_budget: [
				["6 sessions x 430 EUR", "2 580 EUR bez DPH"],
				["Intro call", "zdarma"],
				["Faktura na", "{company}, vystaví Marian Kamenistak (OSVČ), číslo objednávky na faktuře"],
				["Platba", "na fakturu"],
			],
			no_budget: [
				["Pilot: 1 session", "430 EUR bez DPH"],
				["Při pokračování do 30 dnů", "započítá se do kvartálu o 6 sessions, celkem 2 580 EUR"],
				["Intro call", "zdarma"],
				["Faktura na", "{company}, vystaví Marian Kamenistak (OSVČ), číslo objednávky na faktuře"],
				["Platba", "na fakturu"],
			],
		},
		s_measure: "Jak to měříme",
		measure_bullets: [
			"Cíle na papíře před první session, výchozí stav zapsaný",
			"Společné review po třetí session",
			"Závěrečné review po šesté session",
			"Stop klauzule: když se za 90 dní nic nepohne, končíme",
		],
		s_risk: "Kontrola rizika",
		risk_bullets: [
			"Intro call zdarma",
			"Session hodnocená pod 7/10 se neplatí",
			"Veřejný ceník: marian.coach/cs/cenik/",
		],
		s_budget: "Zdroj rozpočtu",
		budget_body: {
			ld_budget: "Rozpočet na vzdělávání a rozvoj (L&D), individuální alokace.",
			no_budget: "Diskreční rozpočet týmu; před větší žádostí jedna session jako pilot.",
		},
		s_why_now: "Proč teď",
		why_now_body:
			"První role jako {role}. HBR / Zenger Folkman (2012): průměrný manažer dostane první leadership trénink ve 42 letech, zhruba deset let po tom, co začne vést lidi. CEB/Gartner: zhruba 60 % nových manažerů v prvních dvou letech nepodává výkon nebo selže.",
		s_alternatives: "Zvažované alternativy",
		alt_bullets: {
			conference:
				"Konference: podobné peníze, dva dny přednášek, žádné pokračování na mém problému.",
			course: "Kurz: levnější, obecný, bez zodpovědnosti za výsledek.",
			internal_coach:
				"Interní mentor nebo kouč: zdarma, ale uvnitř mé reportovací linie, takže neřeknu tu neučesanou verzi problému.",
		},
		alt_closing: "1:1 na mém problému s cíli a stop klauzulí vychází na výsledek nejlevněji.",
		s_math: "Počty na ubrousek",
		math_risk_closing:
			"Pro jistotu půlka: {discounted} EUR proti {ask} EUR = {roi}x.",
		math_zero_body:
			"Nahradit jednoho senior engineera stojí 40 až 60 tisíc EUR (Gallup: půl až dvojnásobek platu). Tohle stojí {ask} EUR. Jeden odchod, kterému předejdeme, nebo jeden kvartál skluzu to zaplatí patnáctkrát.",
		s_give_back: "Co dám zpět",
		give_back_body: "Písemné shrnutí pro tým po šesté session.",
		s_decision: "Rozhodnutí potřebuji do",
		decision_body: "{decide_by}. Další krok: rezervuji intro call zdarma a přinesu plán ke schválení.",
	},
	objections: [
		{
			objection: "Na tohle nemáme rozpočet.",
			answer:
				"Většina firem má na osobu položku L&D nebo konference; přesně na tohle je. Když je naše vyčerpaná, můžu začít jednou session za 430 EUR a rozhodneme se potom, nebo to rozdělíme do dvou kvartálů.",
		},
		{
			objection: "Proč ne náš interní kouč nebo zkušenější kolega?",
			answer:
				"Ty využiju taky. Tohle je někdo, kdo vedl engineering ve velkém a stojí mimo mou reportovací linii, takže můžu přinést tu neučesanou verzi problému. Dva různé nástroje.",
		},
		{
			objection: "Proč ne kurz nebo konference?",
			answer:
				"Kurz řeší obecný případ; můj problém je konkrétní a má termín. Sessions jsou o mé skutečné situaci s cíli, na kterých se dohodneme. A je to levnější než jedna provize recruiterovi.",
		},
		{
			objection: "Jak poznáme, že to funguje?",
			answer:
				"Cíle na papíře před první session, review po třetí a šesté, session pod 7/10 se neplatí a po 90 dnech končíme, když se nic nepohne. To je víc měření, než má většina školení.",
		},
		{
			objection: { informal: "Co když po tom odejdeš?", formal: "Co když po tom odejdete?" },
			answer:
				"Lidi obvykle odcházejí, když v roli stagnují, ne po tom, co do nich někdo investoval. Tohle je o tom dělat tuhle práci líp tady, a co se naučím, sepíšu pro tým.",
		},
	],
	evidence: [
		{
			claim: "Nahradit zaměstnance stojí půl až dvojnásobek jeho ročního platu.",
			source: "Gallup, 2019",
			url: "https://www.gallup.com/workplace/247391/fixable-problem-costs-businesses-trillion.aspx",
		},
		{
			claim: "Průměrný věk při prvním leadership tréninku: 42, zhruba deset let po tom, co člověk začne vést lidi.",
			source: "HBR / Zenger Folkman, 2012",
			url: "https://hbr.org/2012/12/why-do-we-wait-so-long-to-trai",
		},
		{
			claim: "Zhruba 60 % nových manažerů v prvních dvou letech nepodává výkon nebo selže.",
			source: "CEB / Gartner (sekundární citace)",
			url: "https://www.forbes.com/sites/williamarruda/2023/02/15/why-most-new-managers-fail-and-how-to-prevent-it/",
		},
		{
			claim: "Metaanalýza 39 randomizovaných vzorků: koučink na pracovišti má střední, opakovaně potvrzený pozitivní efekt.",
			source: "De Haan & Nilsson, Academy of Management Learning & Education, 2023",
			url: "https://journals.aom.org/doi/10.5465/amle.2022.0107",
		},
		{
			claim: "3 400+ sessions, 300 leaderů od roku 2019, hodnocení 9,17/10 z 300+ recenzí.",
			source: "marian.coach",
			url: "https://www.marian.coach/cs/engineering-leadership-statistics/",
		},
	],
	engagement: [
		"6 sessions během 3 měsíců",
		"Cíle na papíře před první session",
		"Review po třetí session, závěrečné po šesté",
		"Intro call zdarma",
		"Session hodnocená pod 7/10 se neplatí",
	],
	next_steps: [
		"Nejdřív pošli e-mail, pak si řekni o 15 minut",
		"Vezmi na schůzku jednostránkový podklad a nech jim ho k přeposlání",
		"Až máš ano, rezervuj intro call zdarma: https://www.marian.coach/meet",
		"Faktura jde na firmu s vaším číslem objednávky",
	],
	value_formula: {
		heading: "Kolik mentoring vynese za 6 měsíců, sečteno ze čtyř řádků",
		lines: [
			"Ušetřené peníze: odvrácený odchod, nepovedený nábor, hodiny strávené hašením",
			"Odvrácená cena zpoždění: položky roadmapy dodané včas, ne o kvartál později",
			"Získaná příležitost: iniciativa, na kterou nikdo neměl kapacitu",
			"Odvrácené klouzání roadmapy: závazky, které drží, plán vs. dodáno",
		],
		rule: "Počítej jen řádky, které obhájíš před CFO, a pak výsledek vyděl dvěma. Když pořád několikanásobně převyšuje částku, o kterou žádáš, pošli to. Manažeři schvalují čísla s termínem review, pocity málokdy.",
	},
	worked_examples: [
		{
			role: "Engineering Manager, tým 8 lidí",
			setup: "Plně nákladový tým kolem 800 000 EUR ročně. Jeden senior má nohu ze dveří a predikovatelnost dodávek se drží kolem 60 %.",
			kpis: "Nulová nechtěná fluktuace, plán vs. dodáno z 60 % na 85 %, otevřený případ podvýkonu vyřešený do 4 týdnů.",
			math: "Jen retenční řádek: nahradit toho seniora stojí 40 až 60 tisíc EUR, balíček stojí 2 580 EUR. Jeden odvrácený odchod zaplatí mentoring patnáctkrát.",
		},
		{
			role: "Director, 3 týmy, 24 engineerů",
			setup: "Rozhodnutí o reorganizaci leží dva kvartály a s ním klouže i vlajková funkce, na které visí zhruba 300 000 EUR ročních tržeb.",
			kpis: "Reorganizace rozhodnutá a nasazená do 6 týdnů, funkce zpět na slíbeném datu, obě otevřené seniorní pozice zavřené.",
			math: "Jen cena zpoždění: dodat o kvartál dřív na tržbách 300 000 EUR má hodnotu asi 75 000 EUR. Po vydělení dvěma kvůli skepsi CFO je to 37 000 proti 2 580. Pořád 14x.",
		},
		{
			role: "Staff Engineer",
			setup: "Rozhodnutí build vs. buy, na kterém visí 100 000+ EUR ročně, a vliv, který končí na hranici týmu.",
			kpis: "Decision doc napsaný, obhájený a přijatý; jedna mezitýmová iniciativa dotažená od začátku do konce; podklad k povýšení sepsaný.",
			math: "Špatná volba platformy se vrací každý rok v řádu statisíců a nahradit staff engineera stojí 6 až 9 měsíčních platů. Kterýkoli z těch řádků sám o sobě překonává cenu balíčku o řád.",
		},
	],
	math: {
		attrition:
			"Odvrácená fluktuace: {n} {unit} v riziku x 50 000 EUR (nahradit seniora stojí 40 až 60 tisíc EUR; Gallup: půl až dvojnásobek platu) = {value} EUR",
		person: "senior",
		people: "senioři",
		delay:
			"Odvrácená cena zpoždění: {rev} EUR ročních tržeb na klouzající položce / 4 (o kvartál dřív) = {value} EUR",
		lift: "Zlepšení týmu: {team} engineerů x {sal} EUR x 2 % (záměrně konzervativní odhad) = {value} EUR",
		cfo: "Pro jistotu půlka (CFO diskont): {discounted} EUR proti {ask} EUR = {roi}x",
		note_zero:
			"Bez zadaných seniorů v riziku nic nenárokujeme. Nahradit jednoho seniora stojí 40 až 60 tisíc EUR; proti {ask} EUR to jeden odvrácený odchod zaplatí patnáctkrát.",
		note_pos: "Po půlení případ pokryje žádanou částku {roi}x.",
	},
	report: {
		title: "Business case pro mentoring: {your_name}, {role}",
		problem: "Co chci vyřešit",
		math: "Počty na ubrousek",
		one_pager: "Jednostránkový podklad pro šéfa (k přeposlání financím)",
		email: "E-mail k přeposlání",
		subject: "Předmět",
		slack: "Verze pro Slack / Teams",
		talking: "Body do rozhovoru",
		objections: "Když budou namítat",
		evidence: "Zdroje",
		next_steps: "Další kroky",
		engagement: "Podmínky",
		value_formula: "Jak spočítat hodnotu",
		worked_examples: "Spočítané příklady",
	},
};

export const STRINGS: Record<"en" | "cs", Strings> = { en: EN, cs: CS };
