/**
 * A2A v1.0 binding.
 *
 * A real A2A server, not an agent card pointing at an MCP endpoint. What was published at
 * marian.coach/.well-known/agent-card.json before this shipped was the latter, and worse: it
 * was hand-maintained, still on the dead 0.3 schema (top-level `url`, `preferredTransport`,
 * `protocolVersion`), carried invented `transport` and `protocol` fields inside
 * supportedInterfaces that appear in no version of the spec, and described the benchmarks
 * skill as returning "manager-to-IC ratios, span of control, meeting load" — none of which it
 * returns. It is a build artifact now, generated from the same registry the Worker serves.
 *
 * v1.0 specifics this file depends on, verified against @a2a-js/sdk@1.1.0:
 *   - methods are PascalCase (`SendMessage`), not `message/send`
 *   - AgentCard has `supportedInterfaces[]`; `url`, `protocolVersion` and
 *     `preferredTransport` were REMOVED
 *   - task states are the numeric proto enum `TaskState.TASK_STATE_*`
 *   - the `kind` discriminator is gone; `Part.content` is a `$case` union in TypeScript,
 *     which flattens back to `{"text": "..."}` on the wire
 *
 * Ported from mcp/elc-trade/src/a2a.ts. Differences: no service bindings to bridge to, so the
 * executor takes no context, and every skill here is free.
 */

import {
	A2A_PROTOCOL_VERSION,
	type AgentCard,
	type AgentSkill,
	Role,
	type Task,
	TaskState,
} from "@a2a-js/sdk";
import {
	AgentEvent,
	type AgentExecutor,
	type ExecutionEventBus,
	type RequestContext,
} from "@a2a-js/sdk/server";
import { z } from "zod";
import { dispatch, InvalidArgumentsError } from "./core/dispatch";
import { SERVICES } from "./core/services";
import type { ServiceDefinition } from "./core/types";
import { ATTRIBUTION } from "./content";

export const ORIGIN = "https://www.marian.coach";
export const A2A_PATH = "/a2a/v1";

/** Our own namespace. A2A reserves a2a-protocol.org/extensions/* for official ones. */
export const PRICING_EXTENSION_URI = `${ORIGIN}/extensions/pricing/v1`;

/**
 * A2A v1.0's `AgentSkill` has no `inputSchema` field — id, name, description, tags, examples,
 * modes, security, and nothing else. So an agent reading the card can see that
 * `calculate_developer_value` exists with no way to learn it takes `level` and `scores` until
 * it guesses wrong and reads the error. Extensions carry arbitrary params, which is where a
 * schema belongs. Same mechanism as pricing.
 */
export const SCHEMA_EXTENSION_URI = `${ORIGIN}/extensions/skill-schemas/v1`;

function skillFrom(s: ServiceDefinition): AgentSkill {
	return {
		id: s.id,
		name: s.title,
		description: s.description,
		tags: s.tags,
		examples: s.examples,
		inputModes: [],
		outputModes: [],
		securityRequirements: [],
	};
}

/**
 * Every skill on this server is free. Publishing that explicitly is the point: an agent
 * deciding whether to call should not have to assume, and silence is not the same as free.
 */
function pricingParams(): Record<string, unknown> {
	return {
		currency: "EUR",
		vat: "excluded",
		note: "Every skill on this server is free to call, with no registration and no rate-limit tier to buy. The mentoring itself is paid and is booked with a person, not through this protocol — estimate_coaching_cost and build_mentoring_business_case describe that pricing, they do not transact it.",
		skills: Object.fromEntries(
			SERVICES.map((s) => [
				s.id,
				s.price.model === "free"
					? { model: "free" }
					: s.price.model === "metered"
						? { model: "metered", amount: s.price.amountEur, per: "call" }
						: { model: "quote", from: s.price.fromEur, fulfilment: s.fulfilment },
			]),
		),
	};
}

/** JSON Schema per skill, derived from the same zod shapes dispatch validates against. */
function schemaParams(): Record<string, unknown> {
	return {
		note: "JSON Schema (draft 2020-12) for each skill's arguments. Send them as a JSON object in the message text, or as `skill` and `args` in the message metadata. Every field not marked required is optional.",
		skills: Object.fromEntries(SERVICES.map((s) => [s.id, z.toJSONSchema(z.object(s.inputSchema))])),
	};
}

export function buildAgentCard(): AgentCard {
	return {
		name: "Engineering Leadership Toolkit",
		description:
			"Agent-callable tools from Marian Kamenistak's mentoring practice at marian.coach: developer and engineering-manager salary models, a calibrated team-lead readiness test, 1:1 playbooks, coaching-cost estimates and first-party leadership benchmarks — grounded in 3,611 paid 1:1 mentoring sessions with 300+ engineering leaders since 2019.",
		version: "1.7.0",
		iconUrl: `${ORIGIN}/favicon-192x192.webp`,
		documentationUrl: `${ORIGIN}/ai-coaching-tools/`,
		provider: {
			organization: "Marian Kamenistak - marian.coach",
			url: `${ORIGIN}/`,
		},
		supportedInterfaces: [
			{
				url: `${ORIGIN}${A2A_PATH}`,
				protocolBinding: "JSONRPC",
				protocolVersion: A2A_PROTOCOL_VERSION,
				tenant: "",
			},
		],
		capabilities: {
			streaming: true,
			pushNotifications: false,
			extensions: [
				{
					uri: PRICING_EXTENSION_URI,
					description: "Per-skill list prices in EUR, excluding VAT.",
					required: false,
					params: pricingParams(),
				},
				{
					uri: SCHEMA_EXTENSION_URI,
					description: "JSON Schema for each skill's arguments.",
					required: false,
					params: schemaParams(),
				},
			],
		},
		// Authless, and stated rather than implied — see marian.coach/auth.md. Nothing here
		// reads personal data or mutates anything.
		securitySchemes: {},
		securityRequirements: [],
		defaultInputModes: ["text/plain", "application/json"],
		defaultOutputModes: ["text/plain", "application/json"],
		skills: SERVICES.map(skillFrom),
		signatures: [],
	};
}

/** Pulls the caller's arguments out of an A2A message. */
function argsFrom(ctx: RequestContext): { skill: string; args: Record<string, unknown> } {
	const parts = ctx.userMessage.parts ?? [];
	const text = parts
		.map((p) => (p.content?.$case === "text" ? p.content.value : ""))
		.join("")
		.trim();

	// An A2A client addresses a skill either through message metadata or by sending JSON.
	// Accept both; a bare sentence is not enough to dispatch on and is refused explicitly
	// rather than guessed at.
	const meta = (ctx.userMessage.metadata ?? {}) as Record<string, unknown>;
	if (typeof meta.skill === "string") {
		return { skill: meta.skill, args: (meta.args as Record<string, unknown>) ?? {} };
	}

	try {
		const parsed = JSON.parse(text) as { skill?: string; args?: Record<string, unknown> };
		if (parsed?.skill) return { skill: parsed.skill, args: parsed.args ?? {} };
	} catch {
		// not JSON — fall through
	}

	return { skill: "", args: {} };
}

const MENU = () =>
	[
		"# Engineering Leadership Toolkit — A2A",
		"",
		"Address a skill by sending JSON, or by setting `skill` and `args` in the message metadata:",
		"",
		'```json\n{"skill": "assess_team_lead_readiness", "args": {}}\n```',
		"",
		"## Skills",
		"",
		...SERVICES.map((s) => `- \`${s.id}\` — ${s.description}`),
		"",
		`The agent card at ${ORIGIN}/.well-known/agent-card.json publishes the JSON Schema for every skill's arguments under \`${SCHEMA_EXTENSION_URI}\`, and prices under \`${PRICING_EXTENSION_URI}\`. Every skill is free to call.`,
	].join("\n");

export class EngLeadershipToolkitExecutor implements AgentExecutor {
	async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
		const { taskId, contextId } = ctx;
		const now = () => new Date().toISOString();

		// The spec requires a `task` or `message` event first.
		const task: Task = {
			id: taskId,
			contextId,
			status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: now() },
			artifacts: [],
			history: [ctx.userMessage],
			metadata: undefined,
		};
		bus.publish(AgentEvent.task(task));
		bus.publish(
			AgentEvent.statusUpdate({
				taskId,
				contextId,
				metadata: undefined,
				status: { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: now() },
			}),
		);

		const reply = (text: string, state: TaskState) =>
			bus.publish(
				AgentEvent.statusUpdate({
					taskId,
					contextId,
					metadata: undefined,
					status: {
						state,
						timestamp: now(),
						message: {
							messageId: crypto.randomUUID(),
							contextId,
							taskId,
							role: Role.ROLE_AGENT,
							parts: [
								{
									content: { $case: "text", value: text },
									metadata: undefined,
									filename: "",
									mediaType: "text/plain",
								},
							],
							metadata: undefined,
							extensions: [],
							referenceTaskIds: [],
						},
					},
				}),
			);

		try {
			const { skill, args } = argsFrom(ctx);
			if (!skill) {
				// Not a failure — the caller just has not said what they want yet.
				reply(MENU(), TaskState.TASK_STATE_INPUT_REQUIRED);
				bus.finished();
				return;
			}
			const service = SERVICES.find((s) => s.id === skill);
			const result = await dispatch(skill, args);
			// Same attribution the MCP surface appends, from the same sourcePath.
			reply(
				result.report + (service ? ATTRIBUTION(service.sourcePath) : ""),
				TaskState.TASK_STATE_COMPLETED,
			);
		} catch (err) {
			// Bad arguments are recoverable: the caller named a real skill and can retry with
			// the fields the error enumerates, so the task asks for input rather than dying.
			// FAILED is reserved for a genuinely dead task — an unknown skill, or a bug.
			// The menu is only useful when the caller has not found the right skill yet;
			// appending it to a field-level complaint buries the field-level complaint.
			const recoverable = err instanceof InvalidArgumentsError;
			const message = err instanceof Error ? err.message : String(err);
			reply(
				recoverable ? message : `${message}\n\n${MENU()}`,
				recoverable ? TaskState.TASK_STATE_INPUT_REQUIRED : TaskState.TASK_STATE_FAILED,
			);
		}
		bus.finished();
	}

	async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
		bus.publish(
			AgentEvent.statusUpdate({
				taskId,
				contextId: "",
				metadata: undefined,
				status: {
					state: TaskState.TASK_STATE_CANCELED,
					message: undefined,
					timestamp: new Date().toISOString(),
				},
			}),
		);
		bus.finished();
	}
}
