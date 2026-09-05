/**
 * The advertising contract: anything the registry publishes, the server can answer.
 *
 * This is the test that makes the registry safe. SERVICES is consumed by the MCP tool list,
 * the docs page and (next) the A2A agent card, so an entry with no handler is a capability
 * advertised to every agent that reads the card and answerable by none of them.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SERVICES } from "../src/core/services";
import {
	dispatch,
	InvalidArgumentsError,
	unimplementedServices,
	UnknownServiceError,
} from "../src/core/dispatch";

describe("service registry", () => {
	it("every advertised service has a handler", () => {
		expect(unimplementedServices()).toEqual([]);
	});

	it("ids are unique", () => {
		const ids = SERVICES.map((s) => s.id);
		expect(ids).toEqual([...new Set(ids)]);
	});

	it("every service carries the metadata the agent card requires", () => {
		for (const s of SERVICES) {
			expect(s.id, `${s.id}: id`).toMatch(/^[a-z][a-z0-9_]*$/);
			expect(s.tags.length, `${s.id}: tags`).toBeGreaterThan(0);
			expect(s.examples.length, `${s.id}: examples`).toBeGreaterThan(0);
			expect(s.description.length, `${s.id}: description`).toBeGreaterThan(40);
			// sourcePath drives both the attribution footer and structuredContent.source.
			expect(s.sourcePath, `${s.id}: sourcePath`).toMatch(/^\//);
			expect(s.summary.length, `${s.id}: summary`).toBeGreaterThan(0);
			expect(s.question.length, `${s.id}: question`).toBeGreaterThan(0);
		}
	});

	it("rejects an unknown service by name", async () => {
		await expect(dispatch("no_such_tool", {})).rejects.toBeInstanceOf(UnknownServiceError);
	});
});

describe("argument validation", () => {
	// This is the transport-parity guard. MCP validates through registerTool's schema; the
	// A2A executor parses JSON and calls dispatch directly. Without validation HERE the two
	// enforce different contracts and A2A enforces none.
	it("rejects a missing required argument", async () => {
		await expect(dispatch("get_one_on_one_playbook", {})).rejects.toBeInstanceOf(
			InvalidArgumentsError,
		);
	});

	it("names the accepted arguments so a caller can recover from one error", async () => {
		const err = await dispatch("estimate_coaching_cost", {}).catch((e) => e as Error);
		expect(err).toBeInstanceOf(InvalidArgumentsError);
		expect(err.message).toContain('Invalid arguments for "estimate_coaching_cost"');
		expect(err.message).toContain("Accepted arguments:");
		// A2A's AgentSkill has no inputSchema field, so if the error does not name the
		// fields the caller is reduced to guessing them.
		for (const f of ["coaching_type", "client_role", "territory", "coach_seniority", "scope"]) {
			expect(err.message, `error should name ${f}`).toContain(f);
		}
		expect(err.message).toContain("scope (optional)");
	});

	it("rejects an unknown key instead of silently dropping it", async () => {
		const err = await dispatch("assess_team_lead_readiness", {
			answer: {},
		}).catch((e) => e as Error);
		expect(err).toBeInstanceOf(InvalidArgumentsError);
		// "answer" vs "answers" is the realistic typo, and dropping it silently would have
		// returned the questionnaire as though nothing were wrong.
		expect(err.message).toContain("answers");
	});

	it("applies zod defaults before the handler runs", async () => {
		// The handlers rely on parsed data, so the parse has to happen upstream of them.
		const r = await dispatch("build_mentoring_business_case", { role: "engineering_manager" });
		expect(r.report.length).toBeGreaterThan(1000);
	});
});

describe("input guards survived the move out of the tool closures", () => {
	it("calculate_developer_value refuses unknown skill keys instead of scoring baselines", async () => {
		const r = await dispatch("calculate_developer_value", {
			level: "senior",
			scores: { not_a_real_skill: 9 },
		});
		expect(r.report).toContain("Unknown skill key: not_a_real_skill");
		expect(r.report).toContain("Nothing was scored");
		// The bug this guard exists for: a confident salary built purely on baselines.
		expect(r.report).not.toContain("Estimated 2026 gross salary");
		expect(r.data?.salaryEur).toBeUndefined();
	});

	it("calculate_engineering_manager_value refuses unknown skill keys too", async () => {
		const r = await dispatch("calculate_engineering_manager_value", {
			level: "em",
			scores: { nope: 4 },
		});
		expect(r.report).toContain("Unknown skill key: nope");
		expect(r.report).not.toContain("Estimated 2026 gross salary");
	});

	it("assess_team_lead_readiness returns the questionnaire rather than a verdict on no answers", async () => {
		const r = await dispatch("assess_team_lead_readiness", {});
		expect(r.report).toContain("17 questions");
		expect(r.report).not.toContain("readiness verdict:");
	});

	it("assess_team_lead_readiness names the missing answers on a partial submission", async () => {
		const r = await dispatch("assess_team_lead_readiness", { answers: { q1: 0 } });
		expect(r.report).toContain("Missing or invalid answers for:");
		expect(r.report).toContain("q17");
		expect(r.report).not.toContain("readiness verdict:");
	});
});

describe("every service answers its own declared schema", () => {
	// Guards against a registry entry whose inputSchema and handler disagree — the failure
	// mode is a tool that type-checks, advertises fine, and throws on the first real call.
	const SMOKE: Record<string, Record<string, unknown>> = {
		calculate_developer_value: { level: "senior" },
		calculate_engineering_manager_value: { level: "em" },
		assess_team_lead_readiness: {},
		get_engineering_leadership_benchmarks: {},
		choose_mentor_coach_or_advisor: {},
		get_one_on_one_playbook: { situation: "first-session" },
		get_first_time_manager_guidance: {},
		estimate_coaching_cost: {
			coaching_type: "leadership",
			client_role: "em",
			territory: "cee",
			coach_seniority: "experienced",
		},
		build_mentoring_business_case: { role: "engineering_manager" },
	};

	for (const s of SERVICES) {
		it(`${s.id} returns a non-empty report`, async () => {
			const args = SMOKE[s.id];
			expect(args, `no smoke case for ${s.id} — add one`).toBeDefined();
			// Parse through the service's own schema, exactly as the MCP binding does, so
			// zod defaults are applied before the handler sees the arguments.
			const parsed = z.object(s.inputSchema).parse(args) as Record<string, unknown>;
			const r = await dispatch(s.id, parsed);
			expect(r.report.length).toBeGreaterThan(50);
		});
	}
});
