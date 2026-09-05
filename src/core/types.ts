/**
 * The service registry's types.
 *
 * One ServiceDefinition per capability, declared once and consumed by every transport:
 * the MCP tool registration, the docs page, and (next) the A2A agent card. Before this
 * existed the tool metadata lived in three places -- registerTool's arguments, the TOOL_DOCS
 * array, and a hand-maintained agent-card.json in mc-web -- and they had already drifted:
 * TOOL_DOCS' descriptions differed from the registered ones, and the card described the
 * benchmarks tool as returning "manager-to-IC ratios, span of control, meeting load", none of
 * which it returns.
 *
 * Mirrors mcp/elc-trade/src/core/types.ts deliberately. Two streams, one shape, so the A2A
 * binding ports across rather than being reinvented. Differences are noted where they exist.
 */

import type { z } from "zod";

/**
 * What a handler returns. Transport-neutral on purpose: no MCP content blocks, no A2A parts.
 *
 * DIFFERENT FROM elc-trade: `report` here is the body WITHOUT the attribution footer.
 * dispatch() appends it from the service's own `sourcePath`, so a handler cannot forget it
 * and cannot attribute itself to the wrong page.
 */
export interface ServiceResult {
	/** The prose answer. Becomes the MCP text content and the A2A text part. */
	report: string;
	/** Typed fields on top of the prose, matching REPORT_OUTPUT. Optional. */
	data?: Record<string, unknown>;
}

/** What a call costs. Every skill on this server is free; the shape exists so the A2A card's
 *  pricing extension can say so explicitly rather than staying silent about it. */
export type PriceModel =
	| { model: "free" }
	| { model: "metered"; amountEur: number }
	| { model: "quote"; fromEur: number };

export interface ServiceDefinition<TInput extends z.ZodRawShape = z.ZodRawShape> {
	/** MCP tool name AND A2A skill id. Must be identical -- that identity is the whole point. */
	id: string;
	/** MCP title and A2A skill name. */
	title: string;
	/** One paragraph, written for a routing model deciding whether to call this. */
	description: string;
	/** A2A card tags. */
	tags: string[];
	/** A2A card examples. Real questions a user would ask, not paraphrases of the title. */
	examples: string[];
	/** The short question this answers, for the HTML docs page and the get_started menu. */
	question: string;
	/** One-line version of `description` for the docs page and menu. */
	summary: string;
	kind: "data" | "judgment";
	price: PriceModel;
	fulfilment: "immediate";
	/** Zod RAW SHAPE, not z.object(...) -- MCP's registerTool consumes the shape directly. */
	inputSchema: TInput;
	/** Canonical marian.coach path this answer derives from. Drives the attribution footer
	 *  and the `source` field, so it is declared once rather than passed at every call site. */
	sourcePath: string;
}
