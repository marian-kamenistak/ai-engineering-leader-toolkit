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
 *     per SESSION with each subsequent call as a thread reply. PostHog cannot do this:
 *     its insight alerts evaluate on a schedule, and per-event destinations are a paid
 *     CDP product. A direct fetch() is real-time and free.
 *
 * Both hang off `beforeSend`, which @posthog/mcp calls once per emitted event with the
 * fully-built payload. That is deliberately the ONLY hook — one place where a tool call
 * is observed, so the two sinks can never disagree about what happened.
 *
 * @posthog/mcp is pinned EXACTLY (not caret). It is pre-1.0 and ships breaking changes in
 * minor 0.x releases; a caret range would let one land silently on the next npm install.
 */

import { instrument } from "@posthog/mcp";
import { PostHog } from "posthog-node";

/** Per-server identity. The PostHog key is a project *write* key — public by design, it
 *  already ships in the site's client-side bundle, so it belongs in source, not in a secret. */
export interface McpUsageConfig {
	/** Server name, used as the Slack message prefix. */
	serverName: string;
	/** Human label for the property this server fronts, e.g. "marian.coach". */
	domain: string;
	/** PostHog project API key (phc_…) — same project as the domain's web analytics, so
	 *  MCP tool calls and `?ref=mcp` web traffic sit in one funnel. */
	posthogKey: string;
	/** Defaults to EU — every property here is on PostHog EU. */
	posthogHost?: string;
}

/** Secrets this module reads off the Worker env. Both optional: absent = that sink is off,
 *  which is what keeps `wrangler dev` and the test suite from paging anyone. */
export interface McpUsageEnv {
	SLACK_BOT_TOKEN_ELC?: string;
	MCP_USAGE_SLACK_CHANNEL?: string;
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

/* ────────────────────────── Slack ────────────────────────── */

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

/** Format tool arguments as compact Slack lines. Truncated hard — a business-case call can
 *  carry a paragraph of prose and we want a glanceable ping, not a transcript. */
function formatArgs(args: unknown): string {
	if (!args || typeof args !== "object" || Array.isArray(args)) return "";
	const parts: string[] = [];
	for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
		// `context` is the intent parameter @posthog/mcp injects — surfaced on its own line.
		if (k === "context" || v === undefined || v === null || v === "") continue;
		const rendered = typeof v === "object" ? JSON.stringify(v) : String(v);
		parts.push(`${k}: ${rendered.length > 60 ? `${rendered.slice(0, 60)}…` : rendered}`);
		if (parts.length >= 6) break;
	}
	return parts.join(" · ");
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

/* ────────────────────────── session notifier ────────────────────────── */

/**
 * Per-session Slack state.
 *
 * One instance per Durable Object, which is exactly one MCP session — `McpAgent` spins up a
 * fresh DO per connection, so instance fields ARE session state with no store and no TTL to
 * manage. That is the whole reason the per-session grouping is cheap here and would be
 * genuinely hard on a stateless/serverless MCP host.
 */
interface CallNote {
	toolName: string;
	intent?: string;
	args: unknown;
	isError: boolean;
	/** The event's own properties — carries client name/version, which only the event knows. */
	props: Record<string, unknown>;
}

class SessionNotifier {
	private threadTs?: string;
	private calls = 0;
	private parentText = "";
	/** Serialises Slack writes. Two tool calls can land close enough together that both see
	 *  `threadTs === undefined` and each post a parent message, splitting one session across
	 *  two threads. Chaining on a promise keeps them ordered without a lock. */
	private queue: Promise<void> = Promise.resolve();

	constructor(
		private readonly config: McpUsageConfig,
		private readonly env: McpUsageEnv,
		private readonly geo: McpGeo,
	) {}

	notify(note: CallNote): Promise<void> {
		this.queue = this.queue
			.then(() => this.post(note))
			// Never let one Slack failure poison the chain for the rest of the session.
			.catch((e) => console.error("[MCP_USAGE_SLACK] queue", String(e)));
		return this.queue;
	}

	private async post(note: CallNote): Promise<void> {
		this.calls += 1;
		const detail = [
			`*${note.toolName}*${note.isError ? " :warning: _errored_" : ""}`,
			note.intent ? `_${note.intent}_` : "",
			formatArgs(note.args),
		]
			.filter(Boolean)
			.join("\n");

		if (!this.threadTs) {
			this.parentText =
				`:electric_plug: *${this.config.domain} MCP* — new session\n` +
				`Client: ${clientLabel(note.props)}${geoLabel(this.geo)}\n${detail}`;
			const res = await slack(this.env, "chat.postMessage", { text: this.parentText });
			// No ts (Slack down, bot not in channel) means no thread to hang replies off.
			// Leaving threadTs unset makes the next call retry the parent post rather than
			// silently orphaning the rest of the session.
			if (res.ok && res.ts) this.threadTs = res.ts;
			return;
		}

		// Subsequent calls: detail into the thread, and refresh the parent's running count so
		// the channel stays one line per session (the approved shape).
		await slack(this.env, "chat.postMessage", { thread_ts: this.threadTs, text: detail });
		await slack(this.env, "chat.update", {
			ts: this.threadTs,
			text: `${this.parentText}\n:thread: +${this.calls - 1} more call${this.calls === 2 ? "" : "s"} this session`,
		});
	}
}

/**
 * Session lookup for STATELESS hosts (`createMcpHandler`, which builds a fresh McpServer per
 * request — elc-conference-mcp is the one server here shaped that way). With no Durable
 * Object there is no per-session instance to hang state off, so notifiers are resolved by
 * `$session_id` out of a module-level map.
 *
 * Best-effort by construction: a Workers isolate is recycled at the runtime's discretion, and
 * two requests in one session can land on different isolates. When the lookup misses, the
 * session simply opens a second parent message in Slack — noisier, never wrong, and never a
 * dropped notification. Not worth a KV round trip on every tool call to tighten.
 */
const STATELESS_SESSIONS = new Map<string, SessionNotifier>();
/** Bounds the map so a long-lived isolate cannot accumulate sessions without limit. */
const STATELESS_SESSION_CAP = 200;

function statelessNotifier(
	sessionId: string,
	config: McpUsageConfig,
	env: McpUsageEnv,
	geo: McpGeo,
): SessionNotifier {
	const existing = STATELESS_SESSIONS.get(sessionId);
	if (existing) return existing;
	if (STATELESS_SESSIONS.size >= STATELESS_SESSION_CAP) {
		// Map iteration is insertion-ordered, so the first key is the oldest session.
		const oldest = STATELESS_SESSIONS.keys().next().value;
		if (oldest !== undefined) STATELESS_SESSIONS.delete(oldest);
	}
	const created = new SessionNotifier(config, env, geo);
	STATELESS_SESSIONS.set(sessionId, created);
	return created;
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
	/** `DurableObjectState.waitUntil` — keeps the DO alive until Slack and the PostHog flush
	 *  finish, without making the tool's own response wait on them. */
	waitUntil?: (p: Promise<unknown>) => void;
	/** Set for hosts that build a fresh McpServer per request (`createMcpHandler`) rather than
	 *  one per session (`McpAgent` + Durable Object). See STATELESS_SESSIONS above. */
	stateless?: boolean;
}

/**
 * Wire both sinks onto an McpServer. Call this in `McpAgent.init()` BEFORE registering
 * tools — `instrument()` also proxies `_registeredTools`, so tools registered afterwards are
 * wrapped too, but calling it first keeps the ordering obvious.
 */
export function instrumentMcpUsage({
	server,
	config,
	env,
	geo = {},
	waitUntil,
	stateless = false,
}: InstrumentMcpUsageArgs): void {
	if (!config.posthogKey) return;

	const posthog = new PostHog(config.posthogKey, {
		host: config.posthogHost ?? "https://eu.i.posthog.com",
		// Ship every event as it happens. posthog-node's default batching assumes a
		// long-lived process; a Durable Object can be evicted between tool calls, and a
		// batch still sitting in memory when that happens is simply lost.
		flushAt: 1,
		flushInterval: 0,
	});

	/** One notifier per session. On an McpAgent host this instance IS the session, so it is
	 *  built once; on a stateless host it is resolved per event by `$session_id`. */
	const instanceNotifier = stateless ? undefined : new SessionNotifier(config, env, geo);
	const notifierFor = (props: Record<string, unknown>): SessionNotifier =>
		instanceNotifier ??
		statelessNotifier((props.$session_id as string) ?? "unknown-session", config, env, geo);

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
				const p = notifierFor(props).notify({
					toolName:
						eventName === "$mcp_missing_capability"
							? ":grey_question: asked for a capability we don't have"
							: ((props.$mcp_tool_name as string) ?? "unknown tool"),
					intent: props.$mcp_intent as string | undefined,
					args: props.$mcp_parameters,
					isError: Boolean(props.$mcp_is_error),
					props,
				});
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
