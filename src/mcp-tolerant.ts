/**
 * Tolerant MCP argument handling — the schema `registerTool` advertises is not the schema
 * this server enforces.
 *
 * SHARED MODULE. A byte-identical copy lives in every MCP server repo (no monorepo here, so
 * this is copied, not symlinked — same convention as `mcp-usage.ts`). Change it in one place
 * and copy it to all of them, or the servers drift.
 *
 * ## The problem this exists to solve
 *
 * The MCP SDK validates a call against `registerTool`'s own `inputSchema` and throws
 * `McpError -32602` before the handler ever runs. So the only thing a caller who got the
 * shape wrong ever received was a raw Zod dump — `"expected array, received undefined"` —
 * one field named, no menu, no way to recover without guessing again.
 *
 * Measured on 30 days of production traffic (PostHog `$mcp_tool_call` where `$mcp_is_error`,
 * projects 180652 + 214292, read 2026-09-11), the dominant failure was not a typo. It was an
 * agent probing the tool to find out what it wants:
 *
 *   - `arguments: {}` — 28 calls across `quote_reach_combo` (10), `build_partnership_business_case`
 *     (7), `benchmark_leadership_ratio` (7) and `buy_reach` (4)
 *   - `oneoff_ids: []` — 5 more of the same question asked a different way
 *   - slug drift — `hosted_meetup` for `meetup-hosted` (4), `newsletter_section` for
 *     `newsletter-section`, `newsletter`, `job_listing`
 *   - enum synonyms — `brand` for `brand_awareness` (4), `team`, `retention`
 *   - wrong field names entirely — `engineers: 120` where the tool wanted `senior_ics`
 *
 * Every one of those is a caller trying to cooperate. Answering them with a type error is a
 * dead end; answering them with the field list is a conversation.
 *
 * ## What this module does about it
 *
 * `permissiveShape()` is what `registerTool` gets: every field optional, enums widened to
 * plain strings. That hands the call through to the handler instead of letting the SDK
 * reject it. `parseArgs()` is what the handler runs: it validates against the REAL shape,
 * normalises the recoverable mistakes first, and on failure returns a message that lists
 * every accepted argument with its description and valid values.
 *
 * The cost is deliberate and is the same trade-off `elc-trade/src/core/permissive.ts`
 * documented on 2026-09-05: `tools/list` no longer marks a field `required` and no longer
 * publishes enum values as JSON Schema `enum`. Both move into the description, which is
 * where a model reading a tool actually looks — `permissiveShape` writes them there
 * automatically ("Required." prefix, "One of: …" suffix) so the contract cannot drift from
 * the schema it came from.
 *
 * Two things this deliberately does NOT do, because both silently produce wrong answers
 * rather than errors:
 *
 *   - `z.coerce.number()` — parses `null` as `0`. A `managers: null` would become a real
 *     benchmark of zero managers. Numeric strings are converted here instead, by a rule that
 *     only fires on a string that is actually a finite number.
 *   - `z.coerce.boolean()` — parses the string `"false"` as `true`, because every non-empty
 *     string is truthy. Only the exact strings `"true"` and `"false"` are converted here.
 */

import { z } from "zod";

/** The intent parameter. `@posthog/mcp` injects this into every tool as a REQUIRED string
 *  unless the tool already declares it (`analytics-parameters.mjs:canInjectAnalyticsParameter`
 *  skips injection when the property is present). Declaring it here, optional, is what lets a
 *  bare `{}` reach the handler at all — without it the injected required `context` rejects the
 *  call before any of this module's tolerance can apply.
 *
 *  Declaring it also means the SDK stops treating the value as its own, so `$mcp_intent` has
 *  to be recovered through the `intentFallback` hook instead. `instrumentMcpUsage` wires that;
 *  the only visible difference is `$mcp_intent_source` reading `inferred` rather than
 *  `context_parameter`. */
export const CONTEXT_FIELD = "context";

const CONTEXT_DESCRIPTION =
	"Optional. A short description of your goal and why you are calling this tool. Recorded as intent so the tools can be improved; it never changes the answer.";

/* ────────────────────────── zod introspection ────────────────────────── */

interface ZodDef {
	type: string;
	innerType?: z.ZodType;
	element?: z.ZodType;
	keyType?: z.ZodType;
	valueType?: z.ZodType;
	entries?: Record<string, string>;
}

function defOf(field: z.ZodType): ZodDef {
	return (field as unknown as { def: ZodDef }).def;
}

/** Peels `.optional()` / `.default()` / `.nullable()` down to the type that carries the
 *  actual constraint, so an enum inside an optional is still recognisable as an enum. */
function baseType(field: z.ZodType): z.ZodType {
	let current = field;
	for (let depth = 0; depth < 6; depth++) {
		const d = defOf(current);
		if ((d.type === "optional" || d.type === "default" || d.type === "nullable") && d.innerType) {
			current = d.innerType;
			continue;
		}
		return current;
	}
	return current;
}

function enumValues(field: z.ZodType): string[] | undefined {
	const d = defOf(baseType(field));
	if (d.type !== "enum" || !d.entries) return undefined;
	return Object.keys(d.entries);
}

/** The values a field accepts, whether the enum is the field itself or the element type of an
 *  array of them. `oneoff_ids: z.array(z.enum([...]))` is the shape that actually failed in
 *  production, and a menu that omitted its nine ids would reproduce the very dead end this
 *  module exists to remove. `many` drives the wording: "One of" vs "One or more of". */
function choiceList(field: z.ZodType): { values: string[]; many: boolean } | undefined {
	const base = baseType(field);
	const direct = enumValues(base);
	if (direct) return { values: direct, many: false };
	const d = defOf(base);
	if (d.type === "array" && d.element) {
		const inner = enumValues(d.element);
		if (inner) return { values: inner, many: true };
	}
	return undefined;
}

function choiceSentence(field: z.ZodType): string {
	const choice = choiceList(field);
	if (!choice) return "";
	return `${choice.many ? "One or more of" : "One of"}: ${choice.values.join(", ")}.`;
}

/** A field is optional when it accepts `undefined` — which can come from `.optional()`,
 *  `.default()` or a union with undefined, so this asks the schema rather than reading `def`. */
function isOptional(field: z.ZodType): boolean {
	return field.safeParse(undefined).success;
}

/* ────────────────────────── the advertised schema ────────────────────────── */

/**
 * Drops value constraints, keeps enough type information to stay useful in `tools/list`.
 *
 * THE INVARIANT: whatever `normalizeField` below can repair, this must first ADMIT. The SDK
 * validates against the schema produced here before the handler runs, so a shape this rejects
 * never reaches the repair. Getting that wrong is silent — the unit tests on `parseArgs` still
 * pass, because they call it directly, and only a live call shows the SDK rejecting first.
 * It shipped that way on 2026-09-11 (`managers: "12"` still returned a raw Zod dump after
 * deploy) and is now pinned by the "admits everything it repairs" test.
 *
 * Scalars widen to a union rather than to `unknown` so the published schema still names the
 * type it actually wants — an agent reading `anyOf: [number, string]` knows to send a number,
 * where `{}` would tell it nothing.
 */
function widen(field: z.ZodType): z.ZodType {
	const d = defOf(field);
	// Unwrapped rather than passed through: the caller re-applies `.optional()`, and an enum
	// inside an existing optional would otherwise keep its values and be rejected by the SDK.
	if ((d.type === "optional" || d.type === "default" || d.type === "nullable") && d.innerType) {
		return widen(d.innerType);
	}
	if (d.type === "enum") return z.string();
	// A caller who wants one thing writes one thing, so the scalar form has to be admitted too.
	if (d.type === "array" && d.element) {
		const element = widen(d.element);
		return z.union([z.array(element), element]);
	}
	// A questionnaire answered as `{q1: "true"}` or `{q1: "3"}` is the same repairable mistake
	// one level down. Without this branch the record keeps its inner type and the SDK rejects
	// the call before `normalizeField` can fix it — the array/number hole again, nested.
	if (d.type === "record" && d.valueType) {
		// Cast: `ZodDef.keyType` is declared as the general `ZodType`, but `z.record` constrains
		// its key to string|number|symbol. A record's key is always one of those by construction.
		const keyType = (d.keyType ?? z.string()) as z.ZodString;
		return z.record(keyType, widen(d.valueType));
	}
	// `"12"` for 12, `"true"` for true — repaired in normalizeField, admitted here.
	if (d.type === "number") return z.union([z.number(), z.string()]);
	if (d.type === "boolean") return z.union([z.boolean(), z.string()]);
	return field;
}

/** Restates in prose what widening removes from the JSON Schema, so `tools/list` still
 *  carries the whole contract. */
function describeField(field: z.ZodType, description: string): string {
	return [isOptional(field) ? "" : "Required.", description, choiceSentence(field)]
		.filter(Boolean)
		.join(" ")
		.trim();
}

/**
 * The schema to hand `registerTool`. Every field optional, every enum a plain string, plus
 * the `context` field this module owns. `parseArgs` enforces the real thing.
 */
export function permissiveShape(shape: z.ZodRawShape): z.ZodRawShape {
	// Built as a plain record and cast at the end: `z.ZodRawShape`'s index signature is
	// readonly, so it cannot be assigned into field by field.
	const out: Record<string, z.ZodType> = {};
	for (const [name, raw] of Object.entries(shape)) {
		const field = raw as z.ZodType;
		out[name] = widen(field)
			.optional()
			.describe(describeField(field, field.description ?? ""));
	}
	// Only when the tool does not define `context` itself. `get_more_tools` does — there the
	// argument IS the capability report, with a description that tells an agent a bare greeting
	// is welcome. Overwriting it with the generic analytics wording removed the one cue that
	// made the greeting branch discoverable.
	if (!(CONTEXT_FIELD in out)) {
		out[CONTEXT_FIELD] = z.string().optional().describe(CONTEXT_DESCRIPTION);
	}
	return out as z.ZodRawShape;
}

/* ────────────────────────── recoverable-mistake normalisation ────────────────────────── */

/** `hosted_meetup` for `meetup-hosted`, `Brand Awareness` for `brand_awareness`.
 *
 *  Only ever maps onto a value that already exists: case, separators and word order are the
 *  whole licence. `member_list` — sent twice in the measured window, and not a real option at
 *  all — passes through unchanged and is rejected by the enum, which is the correct answer.
 *  Guessing the nearest option would put something in a cart the buyer never asked for. */
function normalizeEnumValue(raw: unknown, values: string[]): unknown {
	if (typeof raw !== "string") return raw;
	const direct = raw.trim();
	if (values.includes(direct)) return direct;
	const canonical = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "-");
	const bySlug = new Map(values.map((v) => [canonical(v), v]));
	const slug = canonical(direct);
	const exact = bySlug.get(slug);
	if (exact) return exact;
	// Word-order insensitive: `hosted_meetup` -> `hosted-meetup` -> sorted `hosted|meetup`,
	// which is the same sorted key as `meetup-hosted`.
	const byWords = new Map(values.map((v) => [canonical(v).split("-").sort().join("-"), v]));
	return byWords.get(slug.split("-").sort().join("-")) ?? raw;
}

/** A string that is genuinely a finite number becomes one. `""`, `null` and `"abc"` are left
 *  alone so the real schema reports them rather than this silently inventing a zero. */
function normalizeNumber(raw: unknown): unknown {
	if (typeof raw !== "string") return raw;
	const trimmed = raw.trim();
	if (trimmed === "" || !Number.isFinite(Number(trimmed))) return raw;
	return Number(trimmed);
}

/** Only the two exact strings. Anything else keeps its type and is reported honestly. */
function normalizeBoolean(raw: unknown): unknown {
	if (raw === "true") return true;
	if (raw === "false") return false;
	return raw;
}

function normalizeField(field: z.ZodType, value: unknown): unknown {
	const base = baseType(field);
	const d = defOf(base);

	if (d.type === "array" && d.element) {
		// A caller who wants one thing writes one thing. `oneoff_ids: "hosted_meetup"` was sent
		// as a bare string; wrapping it is what the caller plainly meant.
		const list = Array.isArray(value) ? value : value === undefined || value === null ? value : [value];
		if (!Array.isArray(list)) return list;
		return list.map((item) => normalizeField(d.element as z.ZodType, item));
	}
	if (d.type === "record" && d.valueType) {
		if (!value || typeof value !== "object" || Array.isArray(value)) return value;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = normalizeField(d.valueType as z.ZodType, v);
		}
		return out;
	}
	if (d.type === "enum") {
		const values = enumValues(base);
		return values ? normalizeEnumValue(value, values) : value;
	}
	if (d.type === "number") return normalizeNumber(value);
	if (d.type === "boolean") return normalizeBoolean(value);
	return value;
}

/* ────────────────────────── validation + guidance ────────────────────────── */

/** Renders the field menu a caller needs to recover. This is the whole point of the module:
 *  the answer to "what does this tool want" is the list, not a type error. */
function acceptedArguments(shape: z.ZodRawShape): string[] {
	return Object.entries(shape).map(([name, raw]) => {
		const field = raw as z.ZodType;
		const optional = isOptional(field);
		const detail = [field.description ?? "no description", choiceSentence(field)]
			.filter(Boolean)
			.join(" ");
		return `  ${name}${optional ? " (optional)" : " (required)"} — ${detail}`;
	});
}

export type ParseResult<T> =
	| { ok: true; data: T; ignored: string[] }
	| { ok: false; message: string; probe: boolean };

/**
 * Validate a tool call against the real shape.
 *
 * `probe` distinguishes the two failure modes, because they deserve different answers. A call
 * with no arguments at all is a question ("what do you need?") and the caller gets the menu as
 * a normal result. A call that supplied arguments and got them wrong is an error, and says so.
 */
export function parseArgs<S extends z.ZodRawShape>(
	toolName: string,
	shape: S,
	raw: unknown,
): ParseResult<z.infer<z.ZodObject<S>>> {
	const supplied: Record<string, unknown> =
		raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};

	// `context` belongs to this module, not to the tool. The SDK only strips the intent
	// argument when IT owns the parameter (`stripOwnedAnalyticsArguments`), and declaring it in
	// `permissiveShape` moves ownership here — so it arrives in `raw` and must come out before
	// the real shape sees it, or every tool would report an unexpected key.
	delete supplied[CONTEXT_FIELD];

	// A key explicitly set to null is a caller saying "I have no value for this", which is what
	// omitting it means. Keeping it would fail `.optional()`, which accepts undefined, not null.
	for (const [key, value] of Object.entries(supplied)) {
		if (value === null) delete supplied[key];
	}

	const menu = [`Accepted arguments:`, ...acceptedArguments(shape)].join("\n");

	// An empty array reads the same as an empty object: the caller is asking what goes in it.
	const meaningful = Object.entries(supplied).filter(
		([, v]) => !(Array.isArray(v) && v.length === 0) && v !== "" && v !== undefined,
	);
	if (meaningful.length === 0) {
		return {
			ok: false,
			probe: true,
			message: `\`${toolName}\` needs arguments before it can answer.\n\n${menu}`,
		};
	}

	const normalized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(supplied)) {
		const field = shape[key] as z.ZodType | undefined;
		normalized[key] = field ? normalizeField(field, value) : value;
	}

	const unknownKeys = Object.keys(normalized).filter((k) => !(k in shape));
	const parsed = z.object(shape).safeParse(normalized);

	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
		// Named explicitly: a caller who sent `engineers: 120` to a tool that wanted `senior_ics`
		// was told only that `senior_ics` was missing, never that the number they did send had
		// been ignored. Both halves of that are needed to fix the call in one more attempt.
		const unknown = unknownKeys.length
			? [
					"",
					`Not arguments of this tool (ignored): ${unknownKeys.map((k) => `\`${k}\``).join(", ")}.`,
				]
			: [];
		return {
			ok: false,
			probe: false,
			message: [`Invalid arguments for \`${toolName}\`.`, "", ...issues, ...unknown, "", menu].join("\n"),
		};
	}

	return { ok: true, data: parsed.data as z.infer<z.ZodObject<S>>, ignored: unknownKeys };
}

/* ────────────────────────── transport-level normalisation ────────────────────────── */

/**
 * Give a `tools/call` an `arguments` object when it arrived without one.
 *
 * The MCP specification makes `params.arguments` OPTIONAL on `tools/call`. The SDK passes it
 * straight through to `z.object(shape).parse()` (`server/mcp.js:125` → `validateToolInput`),
 * and `z.object(...).parse(undefined)` fails — so a spec-compliant client calling a tool that
 * needs no arguments gets `"expected object, received undefined"`. Nothing inside `registerTool`
 * can fix this: making every field optional does not make the object itself optional.
 *
 * Pure and string-in/string-out so it can be tested without a Worker. Handles the JSON-RPC
 * batch form (an array) as well as a single call, and returns the input untouched on anything
 * it does not recognise — a normaliser that throws on malformed JSON would turn a bad request
 * into a 500.
 */
export function normalizeToolCallBody(body: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return body;
	}
	let changed = false;

	const patch = (message: unknown): void => {
		if (!message || typeof message !== "object") return;
		const m = message as { method?: unknown; params?: Record<string, unknown> };
		if (m.method !== "tools/call" || !m.params || typeof m.params !== "object") return;
		if (m.params.arguments === undefined || m.params.arguments === null) {
			m.params.arguments = {};
			changed = true;
			return;
		}
		// A key explicitly set to null is a caller saying "I have no value for this", which is
		// what omitting it means. Dropped HERE rather than in `parseArgs`, because `.optional()`
		// accepts undefined and not null — so the SDK would reject the call with a raw Zod dump
		// before the handler could interpret it.
		const args = m.params.arguments;
		if (args && typeof args === "object" && !Array.isArray(args)) {
			for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
				if (value === null) {
					delete (args as Record<string, unknown>)[key];
					changed = true;
				}
			}
		}
	};

	if (Array.isArray(parsed)) parsed.forEach(patch);
	else patch(parsed);

	return changed ? JSON.stringify(parsed) : body;
}

/**
 * Wrap an incoming Worker request so the MCP transport sees a normalised `tools/call`.
 *
 * Call it in the fetch handler, AFTER `geoFromRequest(request)` — rebuilding a Request drops
 * `request.cf`, which is where the geo bag comes from, and there is no way to carry it over.
 */
export async function normalizeMcpRequest(request: Request): Promise<Request> {
	if (request.method !== "POST") return request;
	if (!(request.headers.get("content-type") ?? "").includes("application/json")) return request;

	const body = await request.text();
	const normalized = normalizeToolCallBody(body);
	if (normalized === body) {
		// Still rebuild: the original body stream has been consumed by `.text()`.
		return new Request(request.url, { method: request.method, headers: request.headers, body });
	}
	const headers = new Headers(request.headers);
	// The patched body is longer than the original, so a carried-over content-length would
	// truncate it. Dropping the header lets the runtime recompute.
	headers.delete("content-length");
	return new Request(request.url, { method: request.method, headers, body: normalized });
}

/**
 * Appended to an otherwise successful answer when the caller passed keys the tool does not
 * have. Silence there produced the worst class of bug this estate has seen: an L&D buyer
 * passed `headcount: 12`, was never told it did nothing, and read the tool's generic answer
 * as a response to the question she believed she had asked.
 *
 * **Currently unreachable on the MCP transport, and that is not fixable from here.** The SDK
 * parses arguments with a plain `z.object(shape)` and hands the handler `parseResult.data`
 * (`server/mcp.js:174-180`); zod strips unknown keys, so an extra field is gone before
 * `parseArgs` ever sees it and `ignored` is always empty. Nothing expressible in a
 * `ZodRawShape` changes that — strip-vs-passthrough is a property of the assembled `ZodObject`,
 * which the SDK builds itself.
 *
 * It is kept wired rather than deleted because it IS reachable on the other transport: an A2A
 * executor parses the JSON body and calls the service directly, with unknown keys intact
 * (`elc-trade/src/core/dispatch.ts`). So the call sites are live there and dormant here, and
 * they start working on MCP the day the SDK stops discarding unknown keys.
 *
 * The practical consequence to remember: on MCP a caller who sends `engineers: 120` to a tool
 * that wanted `senior_ics` is told `senior_ics` is missing and shown the full field menu — but
 * is NOT told that `engineers` was discarded. The menu is what has to carry them.
 */
export function ignoredNotice(toolName: string, ignored: string[], shape: z.ZodRawShape): string {
	if (ignored.length === 0) return "";
	const plural = ignored.length === 1 ? "argument is" : "arguments are";
	return (
		`\n\n---\n\n**Ignored: ${ignored.map((k) => `\`${k}\``).join(", ")}.** ` +
		`That ${plural} not part of \`${toolName}\` and had no effect on the answer above — ` +
		`do not read the result as a response to ${ignored.length === 1 ? "it" : "them"}. ` +
		`Accepted arguments: ${Object.keys(shape).join(", ")}.`
	);
}
