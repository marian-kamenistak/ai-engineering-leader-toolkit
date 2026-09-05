/**
 * Bundle entry for scripts/gen-agent-card.mjs. Prints the agent card as JSON on stdout.
 *
 * This exists so the published /.well-known/agent-card.json is GENERATED from the same
 * service registry the Worker serves, never hand-maintained. The card that was on mc-web
 * before this shipped had drifted onto the dead A2A 0.3 schema, had invented `transport` and
 * `protocol` fields inside supportedInterfaces that appear in no version of the spec, and
 * described one skill as returning data it does not return — exactly what hand-maintenance
 * produces.
 *
 * Same precedent as mc-web's scripts/gen-agent-skills.mjs: a well-known artifact is a build
 * output, not a source file.
 */

import { buildAgentCard } from "./a2a";

console.log(JSON.stringify(buildAgentCard(), null, "\t"));
