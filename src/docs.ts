/**
 * Human-readable docs page served on GET /mcp (browsers / crawlers).
 * MCP clients speak POST (and SSE GET with Accept: text/event-stream),
 * so HTML only ships when the request accepts text/html.
 */

export interface ToolDoc {
	name: string;
	question: string;
	description: string;
}

export function docsHtml(tools: ToolDoc[]): string {
	const rows = tools
		.map(
			(t) =>
				`<tr><td><code>${t.name}</code></td><td>${t.question}</td><td>${t.description}</td></tr>`,
		)
		.join("\n");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Engineering Leadership Toolkit — MCP server | Marian Kamenistak</title>
<meta name="description" content="Free remote MCP server for AI assistants: developer value assessment, engineering-leadership benchmarks from 3,611 mentoring sessions, and mentor-vs-coach guidance. Connect from Claude, ChatGPT, Cursor, Microsoft 365 Copilot, or Perplexity.">
<!-- Added 2026-08-08. This page is the websiteUrl on every MCP registry listing, so it is the
     landing point of every dofollow link the registry play earns -- and it had no canonical, no
     JSON-LD and no link back into the site. Apex/www x /mcp,/mcp/ all return 200, hence the
     explicit canonical. -->
<link rel="canonical" href="https://www.marian.coach/mcp">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="Engineering Leadership Toolkit — MCP server">
<meta property="og:description" content="Free remote MCP server: developer value assessment, engineering-leadership benchmarks from 3,611 mentoring sessions, and mentor-vs-coach guidance.">
<meta property="og:url" content="https://www.marian.coach/mcp">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Engineering Leadership Toolkit","applicationCategory":"DeveloperApplication","operatingSystem":"Any (remote MCP server)","url":"https://www.marian.coach/mcp","offers":{"@type":"Offer","price":"0","priceCurrency":"EUR"},"author":{"@type":"Person","name":"Marian Kamenistak","url":"https://www.marian.coach/"},"publisher":{"@type":"Person","name":"Marian Kamenistak","url":"https://www.marian.coach/"}}
</script>
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
	code, pre { background: #f4f4f4; border-radius: 4px; font-size: 0.9em; }
	code { padding: 0.1em 0.35em; }
	pre { padding: 0.8em 1em; overflow-x: auto; }
	table { border-collapse: collapse; width: 100%; font-size: 0.92em; }
	th, td { border: 1px solid #ddd; padding: 0.5em 0.7em; text-align: left; vertical-align: top; }
	th { background: #f4f4f4; }
	h1 { font-size: 1.6em; } h2 { font-size: 1.2em; margin-top: 2em; }
	a { color: #0b5fa5; }
	.muted { color: #666; font-size: 0.9em; }
</style>
</head>
<body>
<h1>Engineering Leadership Toolkit — MCP server</h1>
<p>A free remote MCP server that gives AI assistants direct access to data from Marian Kamenistak's mentoring practice: 3,611 paid 1:1 sessions with 300+ engineering leaders since 2019.</p>
<p><strong>Endpoint:</strong> <code>https://www.marian.coach/mcp</code> (streamable HTTP, no auth, no signup)</p>

<h2>Tools</h2>
<table>
<tr><th>Tool</th><th>Answers the question</th><th>What it returns</th></tr>
${rows}
</table>

<h2>Connect</h2>
<p><strong>Claude Code</strong></p>
<pre>claude mcp add -t http eng-leadership-toolkit https://www.marian.coach/mcp</pre>
<p><strong>Claude.ai / Claude Desktop</strong> — Settings → Connectors → Add custom connector → paste <code>https://www.marian.coach/mcp</code></p>
<p><strong>Cursor</strong> — add to <code>.cursor/mcp.json</code>:</p>
<pre>{ "mcpServers": { "eng-leadership-toolkit": { "url": "https://www.marian.coach/mcp" } } }</pre>
<p><strong>ChatGPT (developer mode)</strong> — Settings → Connectors → Add → MCP server URL <code>https://www.marian.coach/mcp</code></p>
<p><strong>Microsoft 365 Copilot (via Copilot Studio)</strong> — open your agent → Tools → Add a tool → New tool → Model Context Protocol → Server URL <code>https://www.marian.coach/mcp</code>, authentication None → Add to agent. Streamable HTTP, the one transport Copilot Studio supports.</p>
<p><strong>Perplexity (Pro/Enterprise)</strong> — profile → All settings → Connectors → Custom connector → Remote → MCP Server URL <code>https://www.marian.coach/mcp</code>, transport Streamable HTTP, authentication None.</p>

<h2>Source &amp; method</h2>
<p>All numbers come from the practice's own session log since 2019 and 300 collected post-engagement reviews — no survey panels, no scraped data. Full dataset: <a href="https://www.marian.coach/engineering-leadership-statistics/?ref=mcp">Engineering Leadership Mentoring Statistics</a> (CC BY 4.0). The developer value assessment mirrors the live <a href="https://www.marian.coach/developer-salary-calculator/?ref=mcp">Developer Value Calculator</a>, the EM assessment mirrors the <a href="https://www.marian.coach/engineering-manager-salary-calculator/?ref=mcp">Engineering Manager Salary Calculator</a>, and the readiness test mirrors the <a href="https://www.marian.coach/team-lead-readiness-test/?ref=mcp">Team Lead Readiness Test</a>.</p>
<p class="muted">Built and maintained by <a href="https://www.marian.coach/?ref=mcp">Marian Kamenistak</a> — 1:1 mentoring for engineering leaders. Questions: marian@marian.coach</p>
</body>
</html>`;
}
