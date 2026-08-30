import { describe, it, expect } from "vitest";
import {
	buildBusinessCase,
	renderReport,
	wizardOptions,
	PACK_PRICE_EUR,
	SESSION_PRICE_EUR,
} from "../src/business-case";

describe("business case core — contract", () => {
	it("prices are the list prices", () => {
		expect(SESSION_PRICE_EUR).toBe(395);
		expect(PACK_PRICE_EUR).toBe(1975); // 5 paid + 1 free
	});

	it("returns the full structured shape for a minimal input", () => {
		const bc = buildBusinessCase({ role: "engineering_manager" });
		expect(bc.email.subject.length).toBeGreaterThan(10);
		expect(bc.email.body).toContain("1,975 EUR");
		expect(bc.email.body).toContain("5 paid + 1 free");
		expect(bc.talking_points).toHaveLength(5);
		expect(bc.objections).toHaveLength(5);
		expect(bc.one_pager.sections.length).toBeGreaterThanOrEqual(8);
		expect(bc.meta).toEqual(
			expect.objectContaining({ lang: "en", situation: "ld_budget", pack: "first_quarter" }),
		);
	});

	it("renderReport contains email + one-pager and never the wrong entity or the AI-channel price", () => {
		const txt = renderReport(buildBusinessCase({ role: "director", lang: "en" }));
		expect(txt).toContain("Subject:");
		expect(txt).not.toMatch(/ELC Hub/);
		expect(txt).not.toMatch(/1,778|296 EUR/);
		expect(txt).not.toMatch(/undefined|\[object/);
	});

	it("wizardOptions has 5 roles × 3 problem examples × 3 KPIs in both languages", () => {
		for (const lang of ["en", "cs"] as const) {
			const o = wizardOptions(lang);
			expect(o.roles).toHaveLength(5);
			for (const r of o.roles) {
				expect(o.problem_examples[r.id]).toHaveLength(3);
				expect(o.kpi_suggestions[r.id]).toHaveLength(3);
			}
			expect(o.alternatives).toHaveLength(3);
			expect(o.prices).toEqual({ session_eur: 395, pack_sessions: 6, pack_paid_sessions: 5, pack_free_sessions: 1, pack_eur: 1975 });
		}
	});
});

describe("business case core — behaviour", () => {
	const base = {
		role: "engineering_manager" as const,
		your_name: "Petra",
		manager_name: "Tomas",
		problem: "delivery predictability stuck at 60%",
		kpis: ["Planned-vs-shipped ratio up to 85%"],
		decide_by: "Friday 22 Aug",
	};

	it("ld_budget asks for the pack; no_budget asks for a pilot session", () => {
		const a = buildBusinessCase({ ...base, situation: "ld_budget" });
		const b = buildBusinessCase({ ...base, situation: "no_budget" });
		expect(a.meta.pack).toBe("first_quarter");
		expect(a.math.ask_eur).toBe(1975);
		expect(b.meta.pack).toBe("pilot_session");
		expect(b.math.ask_eur).toBe(395);
		expect(b.email.subject).toMatch(/395 EUR/);
		expect(b.email.body).toMatch(/30 days/);
	});

	it("uses the given problem/kpis/names verbatim and never invents", () => {
		const bc = buildBusinessCase(base);
		expect(bc.email.body).toContain("Hi Tomas,");
		expect(bc.email.body).toContain("delivery predictability stuck at 60%");
		expect(bc.email.body).toContain("Planned-vs-shipped ratio up to 85%");
		expect(bc.email.body.trim().endsWith("Petra")).toBe(true);
		const empty = buildBusinessCase({ role: "director" });
		expect(empty.email.body).toMatch(/\[the one problem/);
		expect(empty.email.body).toMatch(/\[manager/);
		expect(empty.email.body).toMatch(/\[your name\]/);
	});

	it("value is always compared against the 1,975 quarter, never the 395 pilot ask", () => {
		// 50,000 / 395 = 127x is the implausible multiple a CFO stops reading at, and the pilot
		// email must not quote a cost that contradicts its own 395 EUR ask.
		const pilot = buildBusinessCase({ ...base, situation: "no_budget", at_risk_attrition: 2 });
		expect(pilot.math.ask_eur).toBe(395);
		expect(pilot.math.roi_multiple).toBe(25.3);
		expect(pilot.math.lines.join("\n")).toMatch(/1,975 EUR quarter/);
		expect(pilot.email.body).toMatch(/The quarter costs 1,975 EUR/);
		expect(pilot.talking_points.join("\n")).not.toMatch(/costs 40 to 60k EUR\. The full quarter is 395/);
		const quarter = buildBusinessCase({ ...base, situation: "ld_budget", at_risk_attrition: 2 });
		expect(quarter.math.roi_multiple).toBe(pilot.math.roi_multiple);
		const pilotZero = buildBusinessCase({ ...base, situation: "no_budget" });
		expect(pilotZero.math.note).toMatch(/1,975 EUR quarter/);
	});

	it("napkin math: at-risk seniors × 50k, halved, vs the quarter; zero → 15x framing, no fake total", () => {
		const two = buildBusinessCase({ ...base, at_risk_attrition: 2 });
		expect(two.math.total_eur).toBe(100_000);
		expect(two.math.discounted_eur).toBe(50_000);
		expect(two.math.roi_multiple).toBe(25.3);
		expect(two.email.body).toMatch(/2 senior people/);
		const zero = buildBusinessCase(base);
		expect(zero.math.total_eur).toBe(0);
		expect(zero.math.roi_multiple).toBeNull();
		expect(zero.talking_points.join("\n")).toMatch(/20 times/);
	});

	it("legacy agent inputs still add their lines", () => {
		const bc = buildBusinessCase({
			...base,
			team_size: 10,
			avg_salary_eur: 80_000,
			delayed_revenue_eur: 400_000,
		});
		expect(bc.math.lines.join("\n")).toMatch(/Team lift/);
		expect(bc.math.lines.join("\n")).toMatch(/Cost of delay/);
		expect(bc.math.total_eur).toBe(10 * 80_000 * 0.02 + 400_000 / 4);
	});

	it("first_time_in_role adds the HBR/ZF line and the why-now section; otherwise not", () => {
		const yes = buildBusinessCase({ ...base, first_time_in_role: true });
		const no = buildBusinessCase({ ...base, first_time_in_role: false });
		expect(yes.email.body).toMatch(/Zenger Folkman/);
		expect(no.email.body).not.toMatch(/Zenger Folkman/);
		expect(yes.one_pager.sections.some((s) => /Why now/.test(s.heading))).toBe(true);
		expect(no.one_pager.sections.some((s) => /Why now/.test(s.heading))).toBe(false);
	});

	it("alternatives render only when given", () => {
		expect(
			buildBusinessCase(base).one_pager.sections.some((s) => /Alternatives/.test(s.heading)),
		).toBe(false);
		expect(
			buildBusinessCase({ ...base, alternatives: ["course"] }).one_pager.sections.some((s) =>
				/Alternatives/.test(s.heading),
			),
		).toBe(true);
	});

	it("cs renders Czech, formal switches to vykání", () => {
		const ty = buildBusinessCase({ ...base, lang: "cs" });
		const vy = buildBusinessCase({ ...base, lang: "cs", formality: "formal" });
		expect(ty.email.body).toMatch(/^Tomas ahoj,/m);
		expect(vy.email.body).toMatch(/^Dobrý den, Tomas,/m);
		expect(vy.email.body).toMatch(/Vám|Vás|Váš/);
		expect(ty.email.body).not.toMatch(/Vám|Vás|Váš/);
		expect(ty.email.body).toMatch(/1 975 EUR/);
		expect(ty.email.body).toMatch(/5 placených \+ 1 zdarma/);
		expect(ty.meta.lang).toBe("cs");
	});

	it("forbidden words tier 1 never appear (en + cs, all branches)", () => {
		const banned =
			/\b(delve|tapestry|testament|pivotal|leverage|unlock|unleash|game-changer|seamless|elevate|empower|robust|holistic|actually|vlastně)\b/i;
		for (const lang of ["en", "cs"] as const)
			for (const situation of ["ld_budget", "no_budget"] as const)
				for (const ft of [true, false]) {
					const txt = renderReport(
						buildBusinessCase({
							...base,
							lang,
							situation,
							first_time_in_role: ft,
							at_risk_attrition: 1,
							alternatives: ["conference", "course", "internal_coach"],
						}),
					);
					expect(txt).not.toMatch(banned);
					expect(txt).not.toMatch(/undefined|\[object|NaN/);
					expect(txt).not.toMatch(/ELC Hub/);
					expect(txt).not.toMatch(/\{\w+\}/); // every placeholder filled
				}
	});
});
