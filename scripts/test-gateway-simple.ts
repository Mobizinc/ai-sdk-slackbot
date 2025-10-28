/**
 * Simple Anthropic chat test using the new runner pipeline.
 */

import type { CoreMessage } from "../lib/agent/types";
import { runAgent } from "../lib/agent/runner";
import { __setToolRegistry } from "../lib/agent/tool-registry";

async function testSimpleAnthropic() {
  console.log("Testing Anthropic chat...\n");

  const messages: CoreMessage[] = [
    { role: "system", content: "You are a concise assistant. Answer in one sentence." },
    { role: "user", content: "What is 2+2?" },
  ];

  // Ensure we use the default tool registry (no custom tools needed here)
  __setToolRegistry(null);

  try {
    const response = await runAgent({
      messages,
    });

    console.log("✅ SUCCESS!");
    console.log(response);
  } catch (error) {
    console.error("❌ ERROR:", error);
  }
}

testSimpleAnthropic();
