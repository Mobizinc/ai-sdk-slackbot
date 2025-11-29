#!/usr/bin/env tsx
/**
 * Quick CLI to inspect which specialist tools would be exposed for a sample message.
 *
 * Usage:
 *   pnpm tsx scripts/simulate-tool-routing.ts "diagnose connectivity for SCS123456"
 */
import { buildToolAllowList } from "../lib/agent/specialist-registry";
import type { ChatMessage } from "../lib/services/anthropic-chat";

function parseArgs(): { message: string } {
  const message = process.argv.slice(2).join(" ").trim();
  if (!message) {
    return { message: "diagnose connectivity for SCS123456" };
  }
  return { message };
}

function main() {
  const { message } = parseArgs();
  const chatMessages: ChatMessage[] = [{ role: "user", content: message }];

  const routing = buildToolAllowList({
    messages: chatMessages,
    caseNumbers: [],
    contextMetadata: {},
  });

  const matches = routing.matches.map((m) => ({
    agent: m.agent.name,
    score: Number(m.score.toFixed(2)),
    tools: m.agent.toolNames,
    matchedKeywords: m.matchedKeywords,
    missingSignals: m.missingSignals,
    missingContext: m.missingContextRequirements,
  }));

  console.log("\nMessage:", message);
  console.log("\nSpecialist matches:");
  console.table(matches);

  console.log("Tool allowlist:", routing.allowlist ?? []);

  if (routing.pendingRequirements?.length) {
    console.log("\nPending requirements:");
    routing.pendingRequirements.forEach((req) => {
      console.log(`- ${req.label}: ${req.prompt}`);
    });
  }
}

main();
