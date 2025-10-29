/**
 * Test script to verify Microsoft Learn integration for Azure cases
 *
 * This script simulates an Azure quota case and verifies that:
 * 1. The agent detects Azure mentions
 * 2. The agent calls microsoftLearnSearch tool
 * 3. The response includes Microsoft Learn guidance
 */

// Load environment variables
import { config } from "dotenv";
config({ path: ".env.local" });

import { generateResponse } from "../lib/generate-response";
import type { ChatMessage as CoreMessage } from "../lib/agent/types";

async function testAzureCase() {
  console.log("🧪 Testing Azure Microsoft Learn Integration\n");
  console.log("=" .repeat(60));

  // Simulate the case SCS0048730 scenario
  const messages: CoreMessage[] = [
    {
      role: "user",
      content: `provide details for SCS0048730

Case Details:
- Short Description: I need to request a quota increase on Azure Subscription (Citrix altmanplants1 #1303812) from 16 to 70
- Description: I attempted to request a quota increase from 16 units to 70 unit for Microsoft Fabric in subscription Citrix (altmanplants1): #1303812. I was denied with the message "To submit a technical Support request for this subscription, please contact your service provider"
- State: Open
- Priority: 3 - Moderate
- Category: Azure`,
    },
  ];

  console.log("📝 User Query:");
  console.log(messages[0].content);
  console.log("\n" + "=".repeat(60));

  // Track tool calls
  const toolCalls: string[] = [];
  const statusUpdates: string[] = [];

  const updateStatus = (status: string) => {
    statusUpdates.push(status);
    console.log(`🔄 Status: ${status}`);
  };

  try {
    console.log("\n🤖 Agent Processing...\n");

    const response = await generateResponse(messages, updateStatus, {
      channelId: "test-channel",
      channelName: "azure-support",
      threadTs: "1234567890.123456",
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ Response Generated:\n");
    console.log(response);
    console.log("\n" + "=".repeat(60));

    // Validation checks
    console.log("\n🔍 Validation Checks:");

    const hasMicrosoftLearnSection = response.includes("*Microsoft Learn Guidance*") ||
                                      response.includes("Microsoft Learn") ||
                                      response.includes("learn.microsoft.com");

    const mentionsCSP = response.toLowerCase().includes("csp") ||
                        response.toLowerCase().includes("service provider") ||
                        response.toLowerCase().includes("cloud solution provider");

    const hasAzureContext = response.toLowerCase().includes("azure") ||
                           response.toLowerCase().includes("quota");

    console.log(`  ✓ Contains Azure context: ${hasAzureContext ? "✅" : "❌"}`);
    console.log(`  ✓ Includes Microsoft Learn guidance: ${hasMicrosoftLearnSection ? "✅" : "❌"}`);
    console.log(`  ✓ Mentions CSP/service provider context: ${mentionsCSP ? "✅" : "❌"}`);

    // Check status updates for tool usage
    const calledMicrosoftLearn = statusUpdates.some(s =>
      s.toLowerCase().includes("microsoft learn") ||
      s.toLowerCase().includes("searching microsoft")
    );

    console.log(`  ✓ Called Microsoft Learn tool: ${calledMicrosoftLearn ? "✅" : "❌"}`);

    console.log("\n📊 Status Updates:");
    statusUpdates.forEach((status, i) => {
      console.log(`  ${i + 1}. ${status}`);
    });

    // Overall result
    console.log("\n" + "=".repeat(60));
    const allPassed = hasAzureContext && hasMicrosoftLearnSection && calledMicrosoftLearn;

    if (allPassed) {
      console.log("🎉 TEST PASSED: Agent correctly used Microsoft Learn for Azure case");
    } else {
      console.log("⚠️  TEST INCOMPLETE: Some checks failed");

      if (!calledMicrosoftLearn) {
        console.log("   - Agent did not call Microsoft Learn tool");
      }
      if (!hasMicrosoftLearnSection) {
        console.log("   - Response missing Microsoft Learn guidance section");
      }
    }

    return allPassed;

  } catch (error) {
    console.error("\n❌ Test Failed:");
    console.error(error);
    return false;
  }
}

// Run the test
testAzureCase()
  .then((passed) => {
    process.exit(passed ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test execution error:", error);
    process.exit(1);
  });
