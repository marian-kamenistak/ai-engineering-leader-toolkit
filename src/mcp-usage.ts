/**
 * MCP usage instrumentation — PostHog analytics + per-session Slack notification.
 *
 * SHARED MODULE. A byte-identical copy lives in every MCP server repo (no monorepo here,
 * so this is copied, not symlinked — same convention as the client logo glyphs). Change it
 * in one place and copy it to all five, or they drift and the PostHog schema stops joining.
 *
 * Two sinks, one instrumentation point:
 *
 *  1. PostHog (`instrument()` from @posthog/mcp) — the analytics record. Closes the
 *     `ai-mcp-launch` Phase 8 kill rule ("< 50 invocations/mo after 60 days"), which was
 *     previously unmeasurable: Workers observability counts requests to /mcp, not which
 *     tool ran inside them.
 *  2. Slack — the real-time "somebody is using this right now" ping, one parent message
 *     per CONVERSATION with each subsequent call as a thread reply. PostHog cannot do this:
 *     its insight alerts evaluate on a schedule, and per-event destinations are a paid
 *     CDP product. A direct fetch() is real-time and free.
 *
 * Both hang off `beforeSend`, which @posthog/mcp calls once per emitted event with the
 * fully-built payload. That is deliberately the ONLY hook — one place where a tool call
 * is observed, so the two sinks can never disagree about what happened.
 *
 * Session grouping is KV-backed (`MCP_SESSIONS`), keyed by a hash of server + client +
 * geo, not by MCP's own session id. A reconnecting streamable-HTTP client gets a fresh
 * session id on every reconnect — hashing on client identity instead is what turns a
 * conversation that reconnects three times into one Slack thread instead of four. This
 * also means every host shape (Durable-Object-per-session `McpAgent`, or a fresh
 * `McpServer` per request via `createMcpHandler`) resolves grouping identically, so there
 * is no more `stateless` flag or in-memory session map to maintain.
 *
 * A session/conversation shaped like an automated scanner (known probe client names, or
 * an unnamed client on a datacentre network) is demoted to a single flat Slack line with
 * no thread — still visible for audit, never mistaken for a real visitor.
 *
 * @posthog/mcp is pinned EXACTLY (not caret). It is pre-1.0 and ships breaking changes in
 * minor 0.x releases; a caret range would let one land silently on the next npm install.
 */

import { instrument } from "@posthog/mcp";
import { PostHog } from "posthog-node";

/** Per-server identity. The PostHog key is a project *write* key — public by design, it
 *  already ships in the site's client-side bundle, so it belongs in source, not in a secret. */
export interface McpUsageConfig {
	/** Server name, used as the Slack message prefix and as part of the KV conversation key. */
	serverName: string;
	/** Human label for the property this server fronts, e.g. "marian.coach". */
	domain: string;
	/** PostHog project API key (phc_…) — same project as the domain's web analytics, so
	 *  MCP tool calls and `?ref=mcp` web traffic sit in one funnel. */
	posthogKey: string;
	/** Defaults to EU — every property here is on PostHog EU. */
	posthogHost?: string;
	/** Per-server override for the Slack response-summary line (the `→ …` line under a
	 *  call's arguments). Falls back to `defaultSummarize` when omitted — a generic
	 *  "first text block, footer stripped, capped at 200 chars" extractor that works for
	 *  any tool without per-tool wiring. Only override where the generic output is
	 *  verifiably unhelpful for a specific tool's response shape. */
	summarize?: (toolName: string, response: unknown) => string | undefined;
}

/** The structural subset of Workers' `KVNamespace` used here, declared locally rather than
 *  imported from `@cloudflare/workers-types` — one of the five repos this file is copied
 *  into (`elc-conference-mcp-tickets`) does not have that package, and this file must stay
 *  byte-identical across all five. The real `KVNamespace` type is structurally compatible,
 *  so binding it in `wrangler.jsonc`/`wrangler.toml` and typing `env.MCP_SESSIONS` as this
 *  interface (or letting the generated `Env` widen to the real type) both work. */
export interface McpSessionsKv {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

/** Secrets/bindings this module reads off the Worker env. All optional: absent Slack
 *  credentials = that sink is off (keeps `wrangler dev` and the test suite from paging
 *  anyone); absent `MCP_SESSIONS` = calls post as flat, ungrouped Slack lines instead of
 *  threaded conversations — degraded, never broken. */
export interface McpUsageEnv {
	SLACK_BOT_TOKEN_ELC?: string;
	MCP_USAGE_SLACK_CHANNEL?: string;
	MCP_SESSIONS?: McpSessionsKv;
}

/** Request geography, captured in the Worker fetch handler and handed to the Durable Object
 *  via `ctx.props`. It cannot be read inside the DO: `request.cf` lives on the *edge* request,
 *  and by the time a tool handler runs we are several hops past it. */
export interface McpGeo {
	country?: string;
	city?: string;
	/** `request.cf.asOrganization` — the network operator. Occasionally a corporate egress
	 *  ("Deutsche Bank AG"), usually a consumer ISP. Treat as a weak hint, never as identity. */
	org?: string;
	/** McpAgent's `Props` type parameter is constrained to `Record<string, unknown>`, so the
	 *  props bag needs an index signature to be usable as one. */
	[key: string]: unknown;
}

/** Read the geo bag off a request, for `ctx.props`. Call this in the Worker fetch handler. */
export function geoFromRequest(request: Request): McpGeo {
	const cf = (request as { cf?: Record<string, unknown> }).cf;
	if (!cf) return {};
	return {
		country: typeof cf.country === "string" ? cf.country : undefined,
		city: typeof cf.city === "string" ? cf.city : undefined,
		org: typeof cf.asOrganization === "string" ? cf.asOrganization : undefined,
	};
}

/* ────────────────────────── redaction ────────────────────────── */

/**
 * Keys whose values are personal data and must not reach PostHog.
 *
 * `company` is deliberately NOT here. A company name is not personal data, and "which
 * company was pricing a partnership" is the single most useful property on the event.
 * A work email IS personal data, and a person's name is too — those go to Slack (internal,
 * same posture as the existing Reclaim conversion hook) but never into the analytics store.
 *
 * Scoped tight on purpose: a broad /name/i would eat `role_name`, `tool_name`, `preset_id`
 * and gut the analytics for no privacy gain.
 */
const PII_KEYS = /^(email|e_mail|mail|name|full_name|first_name|last_name|contact_name|phone|tel|linkedin)$/i;

/** Catches an address pasted into a free-text field (`company_context` takes prose), where
 *  key-based redaction cannot see it. Belt and braces — the key list handles the schema'd
 *  fields, this handles the ones a visitor typed into. */
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

const REDACTED = "[redacted]";

/** Recursively strip personal data. Returns a new value; never mutates the input, because
 *  the caller still needs the unredacted original for the Slack message. */
function redact(value: unknown, depth = 0): unknown {
	if (depth > 6) return value;
	if (typeof value === "string") return value.replace(EMAIL_IN_TEXT, REDACTED);
	if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		// `$mcp_parameters` carries the whole JSON-RPC envelope, and a tools/call's params are
		// `{ name, arguments }` — where `name` is the TOOL name, not a person's. Redacting it
		// there cost nothing analytically (it survives in `$mcp_tool_name`) but was simply
		// wrong, and a redactor that fires on the wrong field is one you stop trusting on the
		// right one. A real person-name always sits inside `arguments`, never beside it.
		const isCallParams = entries.some(([k]) => k === "arguments") && entries.some(([k]) => k === "name");
		const out: Record<string, unknown> = {};
		for (const [k, v] of entries) {
			const isEnvelopeToolName = isCallParams && k === "name";
			out[k] = PII_KEYS.test(k) && !isEnvelopeToolName ? REDACTED : redact(v, depth + 1);
		}
		return out;
	}
	return value;
}

/* ────────────────────────── Slack formatting ────────────────────────── */

const SLACK_API = "https://slack.com/api/";

async function slack(
	env: McpUsageEnv,
	method: "chat.postMessage" | "chat.update",
	body: Record<string, unknown>,
): Promise<{ ok: boolean; ts?: string }> {
	if (!env.SLACK_BOT_TOKEN_ELC || !env.MCP_USAGE_SLACK_CHANNEL) return { ok: false };
	try {
		const res = await fetch(`${SLACK_API}${method}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.SLACK_BOT_TOKEN_ELC}`,
				"content-type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({ channel: env.MCP_USAGE_SLACK_CHANNEL, unfurl_links: false, ...body }),
		});
		const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; ts?: string; error?: string };
		// `not_in_channel` is the one failure worth reading the log for: the bot was never
		// invited to #mcp-usage, so every notification since deploy has been silently dropped.
		if (!data.ok) console.error("[MCP_USAGE_SLACK]", method, data.error);
		return { ok: Boolean(data.ok), ts: data.ts };
	} catch (e) {
		console.error("[MCP_USAGE_SLACK]", method, String(e));
		return { ok: false };
	}
}

/** `$mcp_parameters` carries the whole JSON-RPC envelope — `{ request: { params:
 *  { arguments: {...} } } }` for a live tools/call — not the tool's arguments directly.
 *  Formatting the envelope (the pre-2026-09 bug) rendered `request: {"id":3,"jsonrpc"…`
 *  and truncated before any real value appeared. Unwrap to the actual arguments object,
 *  with a flat `{arguments:{...}}` shape and a last-resort passthrough for anything else. */
export function unwrapArguments(parameters: unknown): Record<string, unknown> | undefined {
	if (!parameters || typeof parameters !== "object") return undefined;
	const p = parameters as Record<string, unknown>;
	const request = p.request;
	if (request && typeof request === "object") {
		const params = (request as Record<string, unknown>).params;
		if (params && typeof params === "object") {
			const args = (params as Record<string, unknown>).arguments;
			if (args && typeof args === "object") return args as Record<string, unknown>;
		}
	}
	if (p.arguments && typeof p.arguments === "object") return p.arguments as Record<string, unknown>;
	return p;
}

/** Format tool arguments as compact Slack lines. Truncated hard — a business-case call can
 *  carry a paragraph of prose and we want a glanceable ping, not a transcript. Expects
 *  already-unwrapped arguments (see `unwrapArguments`), not the raw envelope. */
export function formatArgs(args: unknown): string {
	if (!args || typeof args !== "object" || Array.isArray(args)) return "";
	const parts: string[] = [];
	for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
		// `context` is the intent parameter @posthog/mcp injects — surfaced on its own line.
		if (k === "context" || v === undefined || v === null || v === "") continue;
		const rendered = typeof v === "object" ? JSON.stringify(v) : String(v);
		parts.push(`${k}: ${rendered.length > 120 ? `${rendered.slice(0, 120)}…` : rendered}`);
		if (parts.length >= 10) break;
	}
	return parts.join(" · ");
}

/** Generic response-summary fallback: first text content block, the attribution footer
 *  (everything from "Source:" onward) stripped, capped at 200 chars. Works for any tool's
 *  response shape without per-tool wiring — `McpUsageConfig.summarize` overrides it only
 *  where this is verifiably unhelpful. */
export function defaultSummarize(_toolName: string, response: unknown): string | undefined {
	if (!response || typeof response !== "object") return undefined;
	const content = (response as { content?: unknown }).content;
	if (!Array.isArray(content)) return undefined;
	const first = content.find(
		(b) => b && typeof b === "object" && (b as { type?: unknown }).type === "text",
	) as { text?: string } | undefined;
	if (!first?.text) return undefined;
	const cut = first.text.split(/\n?Source:/)[0].trim();
	if (!cut) return undefined;
	return cut.length > 200 ? `${cut.slice(0, 200)}…` : cut;
}

function clientLabel(props: Record<string, unknown>): string {
	const name = (props.$mcp_client_name as string) ?? "unknown client";
	const version = props.$mcp_client_version as string | undefined;
	return version ? `${name} ${version}` : name;
}

function geoLabel(geo: McpGeo): string {
	const place = [geo.city, geo.country].filter(Boolean).join(", ");
	if (!place && !geo.org) return "";
	return ` · ${[place, geo.org].filter(Boolean).join(" (")}${geo.org ? ")" : ""}`;
}

/** Synthetic tool names used by external MCP directory/security scanners to check error
 *  handling on an unrecognized `tools/call` (e.g. `__verifymcp_auth_probe_12d20461b38936c3__`).
 *  Folded into `looksAutomated` below rather than fully suppressed: still visible in Slack
 *  as a demoted one-liner, never mistaken for a real visitor, but no longer invisible. */
const SYNTHETIC_PROBE_TOOL_NAME = /^__verifymcp_auth_probe_[0-9a-f]+__$/i;

/** MCP client names seen in production belonging to directory/security scanners rather
 *  than real MCP hosts (evidence: `#web-mcp-usage-bot`, 2026-08 through 2026-09). Matched
 *  as a prefix so a version suffix ("mcp-dataset-probe/0.1") still matches. */
const KNOWN_PROBE_CLIENT_NAMES =
	/^(verifymcp-probe|mcp-dataset-probe|mcp-vouch|mcp-scan|cracked-probe|probe)\b/i;

/** Network-operator hints that mean "datacentre/hosting", not a residential or corporate
 *  ISP — used only when the client also sent no name, since a named client is judged by
 *  its name first. */
const DATACENTRE_ORG_HINTS =
	/\b(hosting|cloud|data ?center|colo|vps|render|ovh|digitalocean|linode|vultr|hetzner|amazon|aws|google cloud|azure|alibaba)\b/i;

/** True when a call looks machine-generated rather than a real visitor's session: a known
 *  scanner client name, a synthetic probe tool name, or an unnamed client calling from a
 *  datacentre network. Demoted calls still post to Slack (a one-liner, see `postDemoted`)
 *  — visible for audit, never threaded as if they were a real conversation. */
export function looksAutomated(props: Record<string, unknown>, geo: McpGeo): boolean {
	const name = (props.$mcp_client_name as string | undefined) ?? "";
	if (KNOWN_PROBE_CLIENT_NAMES.test(name)) return true;
	if (SYNTHETIC_PROBE_TOOL_NAME.test((props.$mcp_tool_name as string) ?? "")) return true;
	const unnamed = !name || name === "unknown client";
	if (unnamed && geo.org && DATACENTRE_ORG_HINTS.test(geo.org)) return true;
	return false;
}

/* ────────────────────────── conversation grouping ────────────────────────── */

/** Small, fast, non-cryptographic string hash (FNV-1a, 32-bit). This is a Slack-thread
 *  bucketing key, not a security boundary, so a full hash algorithm needing `crypto.subtle`
 *  would buy nothing — and would need an ambient `Crypto` type this file cannot assume:
 *  `elc-conference-mcp-tickets` has neither `@cloudflare/workers-types` nor a DOM lib
 *  locally, and this file must stay byte-identical across all five repos. */
function hashKey(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The conversation key groups a reconnecting streamable-HTTP client's calls into one
 *  Slack thread even though MCP hands out a fresh `$session_id` on every reconnect.
 *  Trade-off, accepted 2026-09: two genuine visitors on the same client, same city, same
 *  network operator, within the same 30-minute window (see `SESSION_TTL_SECONDS`) merge
 *  into one thread. Near-zero at current volume. Each thread reply still carries its own
 *  `$session_id` in PostHog, so a bad merge is diagnosable, never silent. */
export function conversationKey(serverName: string, props: Record<string, unknown>, geo: McpGeo): string {
	const clientName = (props.$mcp_client_name as string) ?? "";
	const clientVersion = (props.$mcp_client_version as string) ?? "";
	const raw = [serverName, clientName, clientVersion, geo.city ?? "", geo.country ?? "", geo.org ?? ""].join("|");
	return `mcp:sess:${serverName}:${hashKey(raw)}`;
}

/** A reconnect 30+ minutes after the last call reads as a new conversation, not a
 *  continuation — matches the spec's accepted merge-risk window. */
const SESSION_TTL_SECONDS = 30 * 60;

interface StoredSessionState {
	threadTs: string;
	calls: number;
	parentText: string;
}

interface CallNote {
	toolName: string;
	intent?: string;
	/** Pre-formatted via `formatArgs(unwrapArguments(...))`. */
	argLine: string;
	summary?: string;
	isError: boolean;
}

function formatDetail(note: CallNote): string {
	return [
		`*${note.toolName}*${note.isError ? " :warning: _errored_" : ""}`,
		note.intent ? `_${note.intent}_` : "",
		note.argLine,
		note.summary ? `→ ${note.summary}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

/** Posts (and threads) one call's Slack notification for a real, non-automated
 *  conversation. Reads the current state from KV, decides whether this is the first call
 *  in the conversation or a continuation, posts accordingly, and writes the updated state
 *  back with a refreshed TTL. */
export async function postSessionUpdate(
	kv: McpSessionsKv,
	key: string,
	env: McpUsageEnv,
	config: McpUsageConfig,
	geo: McpGeo,
	props: Record<string, unknown>,
	note: CallNote,
): Promise<void> {
	const existingRaw = await kv.get(key);
	const existing = existingRaw ? (JSON.parse(existingRaw) as StoredSessionState) : null;
	const detail = formatDetail(note);

	if (!existing) {
		const parentText =
			`:electric_plug: *${config.domain} MCP* — new session\n` +
			`Client: ${clientLabel(props)}${geoLabel(geo)}\n${detail}`;
		const res = await slack(env, "chat.postMessage", { text: parentText });
		// No ts (Slack down, bot not in channel) means no thread to hang replies off.
		// Leaving KV unwritten makes the next call retry the parent post rather than
		// silently orphaning the rest of the conversation.
		if (res.ok && res.ts) {
			const state: StoredSessionState = { threadTs: res.ts, calls: 1, parentText };
			await kv.put(key, JSON.stringify(state), { expirationTtl: SESSION_TTL_SECONDS });
		}
		return;
	}

	const calls = existing.calls + 1;
	await slack(env, "chat.postMessage", { thread_ts: existing.threadTs, text: detail });
	await slack(env, "chat.update", {
		ts: existing.threadTs,
		text: `${existing.parentText}\n:thread: +${calls - 1} more call${calls === 2 ? "" : "s"} this session`,
	});
	const state: StoredSessionState = { ...existing, calls };
	await kv.put(key, JSON.stringify(state), { expirationTtl: SESSION_TTL_SECONDS });
}

/** One flat line, no thread — for a call that looks automated (see `looksAutomated`).
 *  Still visible in the channel for audit; never grouped as if it were a real visitor. */
export async function postDemoted(env: McpUsageEnv, props: Record<string, unknown>, geo: McpGeo): Promise<void> {
	await slack(env, "chat.postMessage", { text: `• probe · ${clientLabel(props)}${geoLabel(geo)}` });
}

/** Fallback when no `MCP_SESSIONS` KV binding is configured (e.g. a repo mid-rollout, or
 *  local `wrangler dev` without `--kv`): posts every call as its own untreaded message.
 *  Degraded (no conversation grouping) rather than broken. */
export async function postUngrouped(
	env: McpUsageEnv,
	config: McpUsageConfig,
	props: Record<string, unknown>,
	geo: McpGeo,
	note: CallNote,
): Promise<void> {
	const text = `:electric_plug: *${config.domain} MCP*\nClient: ${clientLabel(props)}${geoLabel(geo)}\n${formatDetail(note)}`;
	await slack(env, "chat.postMessage", { text });
}

/** Serialises Slack/KV writes per conversation key. Two tool calls in the same
 *  conversation can land close enough together that both read "no state yet" from KV and
 *  each post a parent message — chaining on a promise per key keeps them ordered without a
 *  lock. This is a same-isolate guarantee only: two calls landing on different isolates can
 *  still race on the KV read, which just opens a second parent (noisier, never wrong, never
 *  a dropped notification) — the same accepted trade-off the old stateless-host map had. */
const conversationQueues = new Map<string, Promise<void>>();
/** Bounds the map so a long-lived isolate cannot accumulate keys without limit. */
const CONVERSATION_QUEUE_CAP = 200;

export function queueNotify(key: string, task: () => Promise<void>): Promise<void> {
	const prev = conversationQueues.get(key) ?? Promise.resolve();
	const next = prev.then(task).catch((e) => console.error("[MCP_USAGE_SLACK] queue", String(e)));
	if (!conversationQueues.has(key) && conversationQueues.size >= CONVERSATION_QUEUE_CAP) {
		// Map iteration is insertion-ordered, so the first key is the oldest.
		const oldest = conversationQueues.keys().next().value;
		if (oldest !== undefined) conversationQueues.delete(oldest);
	}
	conversationQueues.set(key, next);
	return next;
}

/* ────────────────────────── entry point ────────────────────────── */

/** The structural slice of `McpServer` that `instrument()` needs. Declared loosely so this
 *  module does not have to import the MCP SDK types (which differ across SDK majors). */
type InstrumentableServer = Parameters<typeof instrument>[0];

export interface InstrumentMcpUsageArgs {
	server: InstrumentableServer;
	config: McpUsageConfig;
	env: McpUsageEnv;
	geo?: McpGeo;
	/** `DurableObjectState.waitUntil` — keeps the DO (or isolate) alive until Slack and the
	 *  PostHog flush finish, without making the tool's own response wait on them. */
	waitUntil?: (p: Promise<unknown>) => void;
}

/**
 * Wire both sinks onto an McpServer. Call this in `McpAgent.init()` (or the Worker fetch
 * handler, for a stateless `createMcpHandler` host) BEFORE registering tools —
 * `instrument()` also proxies `_registeredTools`, so tools registered afterwards are
 * wrapped too, but calling it first keeps the ordering obvious.
 */
export function instrumentMcpUsage({ server, config, env, geo = {}, waitUntil }: InstrumentMcpUsageArgs): void {
	if (!config.posthogKey) return;

	const posthog = new PostHog(config.posthogKey, {
		host: config.posthogHost ?? "https://eu.i.posthog.com",
		// Ship every event as it happens. posthog-node's default batching assumes a
		// long-lived process; a Durable Object can be evicted between tool calls, and a
		// batch still sitting in memory when that happens is simply lost.
		flushAt: 1,
		flushInterval: 0,
	});

	instrument(server, posthog, {
		// Inject a `context` argument on every tool so the agent states WHY it called it.
		// This is the highest-value property here — it turns "tool X ran 40 times" into
		// "40 people asked <these questions>". Cost: it changes every tool's advertised
		// input schema, so the Phase 4 eval suite has to be re-run after enabling it.
		context: true,
		// Registers the `get_more_tools` virtual tool: the agent reports what it wanted and
		// we did not have. Direct input to Phase 1 question mapping — arguably the single
		// best reason to install this SDK at all.
		reportMissing: true,
		// Errors already go to Workers observability; a second copy in PostHog error
		// tracking would double-count without adding a signal.
		enableExceptionAutocapture: false,

		beforeSend: (event) => {
			const props = event.properties ?? {};
			const eventName = event.event;

			// Slack fires on real tool calls only. `tools/list` is what registry health
			// checks and every client handshake send — notifying on those would mean a
			// ping every 15 minutes from our own uptime probe.
			if (eventName === "$mcp_tool_call" || eventName === "$mcp_missing_capability") {
				const toolName =
					eventName === "$mcp_missing_capability"
						? ":grey_question: asked for a capability we don't have"
						: ((props.$mcp_tool_name as string) ?? "unknown tool");
				const note: CallNote = {
					toolName,
					intent: props.$mcp_intent as string | undefined,
					argLine: formatArgs(unwrapArguments(props.$mcp_parameters)),
					summary: (config.summarize ?? defaultSummarize)(toolName, props.$mcp_response),
					isError: Boolean(props.$mcp_is_error),
				};

				let p: Promise<void>;
				if (looksAutomated(props, geo)) {
					p = postDemoted(env, props, geo);
				} else if (env.MCP_SESSIONS) {
					const kv = env.MCP_SESSIONS;
					const key = conversationKey(config.serverName, props, geo);
					p = queueNotify(key, () => postSessionUpdate(kv, key, env, config, geo, props, note));
				} else {
					p = postUngrouped(env, config, props, geo, note);
				}
				// Fire-and-forget: the tool's response must not wait on Slack's round trip.
				if (waitUntil) waitUntil(p);
			}

			// Redact AFTER Slack has read the originals. Slack is internal and the contact
			// details are the point there; PostHog is a retained analytics store and they
			// are not. Both sinks see the same call, deliberately at different fidelity.
			if (props.$mcp_parameters !== undefined) props.$mcp_parameters = redact(props.$mcp_parameters);
			if (props.$mcp_response !== undefined) props.$mcp_response = redact(props.$mcp_response);
			// The intent string is agent-authored prose, so no key-based rule can reach it — but
			// an agent will happily write "help Jan at jan@acme.com price a package" into it. The
			// free-text email scrub applies here for exactly that.
			if (typeof props.$mcp_intent === "string") props.$mcp_intent = redact(props.$mcp_intent);
			event.properties = props;
			return event;
		},
	});
}
