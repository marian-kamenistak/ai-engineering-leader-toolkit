/**
 * Regression test for the persona finding of 2026-09-04.
 *
 * Four independent usability testers (the numerate skeptic, the vague visitor, the meetup
 * organiser and the first-time manager) hit the same class: an unrecognised key was silently
 * discarded and the tool answered anyway, confidently, using only level baselines. The numerate
 * skeptic's case was the sharpest — `scores: {"unknown_skill_xyz": 5}` returned a fully formatted
 * salary identical to sending no scores at all, with no signal the input had been dropped.
 *
 * These tests pin the MODEL-layer behaviour that makes the handler guard necessary: assess()
 * genuinely cannot see an unknown key, so nothing downstream can detect the mistake. The guard
 * therefore has to live at the tool boundary, in src/index.ts, before assess() is called.
 */

import { describe, expect, it } from "vitest";
import { PILLARS, assess } from "../src/calculator";
import { EM_PILLARS, assessEm } from "../src/em-calculator";

const ALL_SKILLS = PILLARS.flatMap((p) => p.skills);
const ALL_EM_SKILLS = EM_PILLARS.flatMap((p) => p.skills);

/** The predicate the tool handlers use to reject input. Kept identical here on purpose. */
const unknownKeys = (scores: Record<string, number>, valid: readonly string[]) =>
	Object.keys(scores).filter((k) => !valid.includes(k));

describe("unknown skill keys are detectable at the boundary", () => {
	it("flags a typo'd developer skill key", () => {
		// A plausible real typo: hyphen/underscore confusion.
		expect(unknownKeys({ system_design: 9 }, ALL_SKILLS)).toEqual(["system_design"]);
	});

	it("flags an EM key copied from the developer calculator", () => {
		// The two calculators share no skill ids, so a cross-copied key is always wrong.
		expect(unknownKeys({ "system-design": 9 }, ALL_EM_SKILLS)).toEqual(["system-design"]);
	});

	it("accepts every documented key for both calculators", () => {
		const dev = Object.fromEntries(ALL_SKILLS.map((s) => [s, 7]));
		const em = Object.fromEntries(ALL_EM_SKILLS.map((s) => [s, 7]));
		expect(unknownKeys(dev, ALL_SKILLS)).toEqual([]);
		expect(unknownKeys(em, ALL_EM_SKILLS)).toEqual([]);
	});

	it("the two calculators share no skill ids, so a cross-copied key can never be valid", () => {
		expect(ALL_SKILLS.filter((s) => (ALL_EM_SKILLS as string[]).includes(s))).toEqual([]);
	});
});

describe("why the guard must sit above assess(): the model cannot see the mistake", () => {
	it("assess() returns the identical result for an unknown key and for no scores at all", () => {
		const withGarbage = assess("staff", { unknown_skill_xyz: 5 });
		const withNothing = assess("staff", {});
		// This equality IS the bug the guard prevents. If it ever stops holding, the guard's
		// rationale has changed and this test should be revisited rather than deleted.
		expect(withGarbage).toEqual(withNothing);
		expect(withGarbage.totalScore).toBe(7);
	});

	it("assessEm() behaves the same way", () => {
		expect(assessEm("director", { people_managment: 9 })).toEqual(assessEm("director", {}));
	});

	it("a valid key does move the score, proving the guard is not over-broad", () => {
		expect(assess("staff", { "system-design": 10 }).totalScore).not.toBe(
			assess("staff", {}).totalScore,
		);
	});
});
