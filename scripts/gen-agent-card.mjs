#!/usr/bin/env node
/**
 * Generates mc-web's /.well-known/agent-card.json from this Worker's service registry.
 *
 * Why the card lives on mc-web and not in this Worker: mc-web's `assets` binding shadows
 * /.well-known/*, so a Worker-served card would never reach its own code without
 * run_worker_first. Static file it is — but generated, so it cannot drift from the
 * registry the way the hand-written one did.
 *
 * Run:  npm run card         (writes, then diffs)
 *       npm run card:check   (fails if the committed card is stale — for CI)
 *
 * Deliberately validates before writing. A malformed card is worse than a missing one:
 * A2A clients that cannot parse it fail closed, and the file is the first thing an agent
 * fetches.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
// Overridable so the script is runnable from a git worktree, where the relative path
// resolves somewhere else. Unset in normal use and in CI.
const TARGET =
	process.env.AGENT_CARD_TARGET ??
	join(ROOT, "../../web/mc-web/public/.well-known/agent-card.json");

const check = process.argv.includes("--check");

// ── Build ────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "mc-card-"));
const bundle = join(tmp, "card.mjs");

execFileSync(
	"npx",
	["esbuild", "src/card-entry.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${bundle}`, "--log-level=warning"],
	{ cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] },
);

const json = execFileSync("node", [bundle], { cwd: ROOT, encoding: "utf8" });
const card = JSON.parse(json);

// ── Validate against A2A v1.0 ────────────────────────────────────────────────
// Required fields per the proto. Checked here rather than trusted, because the failure
// mode is silent: a client that cannot parse the card simply never calls us.
const REQUIRED = [
	"name",
	"description",
	"version",
	"supportedInterfaces",
	"capabilities",
	"defaultInputModes",
	"defaultOutputModes",
	"skills",
];

const errors = [];
for (const f of REQUIRED) {
	if (card[f] === undefined) errors.push(`missing required field: ${f}`);
}

// Fields REMOVED in v1.0. Their presence is the signature of a 0.3-era card, which is what
// 15 of the 65 cards found in the wild still are.
for (const dead of ["url", "protocolVersion", "preferredTransport", "additionalInterfaces", "supportsAuthenticatedExtendedCard"]) {
	if (card[dead] !== undefined) errors.push(`field removed in A2A v1.0 is present: ${dead}`);
}

if (!Array.isArray(card.supportedInterfaces) || card.supportedInterfaces.length === 0) {
	errors.push("supportedInterfaces must be a non-empty array");
} else {
	for (const [i, iface] of card.supportedInterfaces.entries()) {
		for (const f of ["url", "protocolBinding", "protocolVersion"]) {
			if (!iface[f]) errors.push(`supportedInterfaces[${i}] missing ${f}`);
		}
		if (!["JSONRPC", "GRPC", "HTTP+JSON"].includes(iface.protocolBinding)) {
			errors.push(`supportedInterfaces[${i}].protocolBinding "${iface.protocolBinding}" is not a valid A2A binding (JSONRPC | GRPC | HTTP+JSON). "MCP" is NOT one — that is the mistake in most published cards.`);
		}
		if (!iface.url?.startsWith("https://")) errors.push(`supportedInterfaces[${i}].url must be absolute https`);
	}
}

if (!Array.isArray(card.skills) || card.skills.length === 0) {
	errors.push("skills must be a non-empty array — an agent card with no skills advertises nothing");
} else {
	for (const [i, s] of card.skills.entries()) {
		for (const f of ["id", "name", "description", "tags"]) {
			if (s[f] === undefined) errors.push(`skills[${i}] (${s.id ?? "?"}) missing ${f}`);
		}
	}
}

if (errors.length) {
	console.error("Agent card failed A2A v1.0 validation:\n" + errors.map((e) => `  - ${e}`).join("\n"));
	process.exit(1);
}

// ── Write or check ───────────────────────────────────────────────────────────
const next = `${JSON.stringify(card, null, "\t")}\n`;
const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : null;

if (check) {
	if (current !== next) {
		console.error(`Stale: ${TARGET}\nRun \`npm run card\` in mcp/elc-trade and commit the result.`);
		process.exit(1);
	}
	console.log(`agent-card.json up to date — ${card.skills.length} skills, A2A v${card.supportedInterfaces[0].protocolVersion}`);
	process.exit(0);
}

writeFileSync(TARGET, next);
console.log(
	current === next
		? `unchanged: ${TARGET}`
		: `wrote: ${TARGET}\n  ${card.skills.length} skills, A2A v${card.supportedInterfaces[0].protocolVersion}, ${card.supportedInterfaces.length} interface(s)\n  skills: ${card.skills.map((s) => s.id).join(", ")}`,
);
