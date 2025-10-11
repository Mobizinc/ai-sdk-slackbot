#!/usr/bin/env ts-node
/**
 * CMDB Pilot Setup Test
 *
 * Validates that all tools and configurations are ready for the Altus CMDB pilot.
 * Run this before starting Phase 1 to ensure everything is working.
 *
 * Usage: npx tsx scripts/test-pilot-setup.ts
 */

import * as fs from "fs";
import * as path from "path";
import { WebClient } from "@slack/web-api";
import { serviceNowClient } from "../lib/tools/servicenow";

interface TestResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

const results: TestResult[] = [];

/**
 * Test helper
 */
function test(name: string, status: "pass" | "fail" | "warn", message: string) {
  results.push({ name, status, message });
}

/**
 * Print results
 */
function printResults() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🧪 CMDB Pilot Setup Test Results`);
  console.log(`${"=".repeat(80)}\n`);

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const warnings = results.filter((r) => r.status === "warn").length;

  for (const result of results) {
    const icon =
      result.status === "pass" ? "✅" : result.status === "fail" ? "❌" : "⚠️";
    console.log(`${icon} ${result.name}`);
    if (result.message) {
      console.log(`   ${result.message}\n`);
    }
  }

  console.log(`${"=".repeat(80)}`);
  console.log(`Summary: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log(`${"=".repeat(80)}\n`);

  if (failed === 0 && warnings === 0) {
    console.log(`✅ All tests passed! You're ready to start the pilot.\n`);
    console.log(`Next step: ./scripts/cmdb-pilot-phase1.sh\n`);
  } else if (failed === 0) {
    console.log(
      `⚠️  Tests passed with warnings. Review warnings above before proceeding.\n`
    );
    console.log(`Next step: ./scripts/cmdb-pilot-phase1.sh\n`);
  } else {
    console.log(`❌ Some tests failed. Please fix the issues above.\n`);
  }

  return failed === 0 ? 0 : 1;
}

/**
 * Test environment variables
 */
function testEnvironment() {
  console.log(`\n🔧 Testing Environment Configuration...\n`);

  // Check .env.local exists
  if (fs.existsSync(".env.local")) {
    test("Environment File", "pass", ".env.local exists");
  } else {
    test("Environment File", "fail", ".env.local not found - copy .env.example");
    return;
  }

  // Check Slack token
  if (process.env.SLACK_BOT_TOKEN) {
    test("Slack Bot Token", "pass", "SLACK_BOT_TOKEN is configured");
  } else {
    test("Slack Bot Token", "fail", "SLACK_BOT_TOKEN not found in .env.local");
  }

  // Check ServiceNow config
  if (process.env.SERVICENOW_INSTANCE_URL) {
    test(
      "ServiceNow URL",
      "pass",
      `Connected to ${process.env.SERVICENOW_INSTANCE_URL}`
    );
  } else {
    test(
      "ServiceNow URL",
      "fail",
      "SERVICENOW_INSTANCE_URL not found in .env.local"
    );
  }

  if (process.env.SERVICENOW_USERNAME && process.env.SERVICENOW_PASSWORD) {
    test("ServiceNow Credentials", "pass", "Username and password configured");
  } else {
    test(
      "ServiceNow Credentials",
      "fail",
      "SERVICENOW_USERNAME or SERVICENOW_PASSWORD missing"
    );
  }
}

/**
 * Test file structure
 */
function testFileStructure() {
  console.log(`\n📁 Testing File Structure...\n`);

  const requiredFiles = [
    { path: "docs/CMDB_PILOT_ALTUS.md", desc: "Pilot plan documentation" },
    {
      path: "docs/CMDB_TOOLS_SUMMARY.md",
      desc: "Tools summary documentation",
    },
    { path: "templates/cmdb-ci-template.json", desc: "CI template" },
    {
      path: "examples/altus-file-server-example.json",
      desc: "Example CI record",
    },
    { path: "scripts/discover-infrastructure.ts", desc: "Discovery script" },
    { path: "scripts/validate-ci.ts", desc: "Validation script" },
    { path: "scripts/cmdb-pilot-phase1.sh", desc: "Phase 1 guide script" },
    { path: "scripts/README.md", desc: "Scripts documentation" },
  ];

  for (const file of requiredFiles) {
    if (fs.existsSync(file.path)) {
      test(file.desc, "pass", `${file.path} exists`);
    } else {
      test(file.desc, "fail", `${file.path} not found`);
    }
  }

  // Check ci-records directory
  if (fs.existsSync("ci-records")) {
    test("CI Records Directory", "pass", "ci-records/ exists");
  } else {
    test(
      "CI Records Directory",
      "warn",
      "ci-records/ not found - will be created automatically"
    );
  }
}

/**
 * Test Slack connection
 */
async function testSlackConnection() {
  console.log(`\n📡 Testing Slack Connection...\n`);

  if (!process.env.SLACK_BOT_TOKEN) {
    test("Slack Connection", "fail", "Cannot test - SLACK_BOT_TOKEN missing");
    return;
  }

  try {
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    const authTest: any = await slack.auth.test();

    if (authTest.ok) {
      test(
        "Slack Authentication",
        "pass",
        `Connected as ${authTest.user} in ${authTest.team}`
      );
    } else {
      test("Slack Authentication", "fail", "Authentication failed");
      return;
    }

    // Check if bot can list channels
    const channelsList: any = await slack.conversations.list({
      types: "public_channel,private_channel",
      limit: 10,
    });

    if (channelsList.ok && channelsList.channels) {
      test(
        "Slack Channels Access",
        "pass",
        `Can access ${channelsList.channels.length} channels`
      );

      // Check for #altus-support specifically
      const altusChannel = channelsList.channels.find(
        (c: any) => c.name === "altus-support"
      );

      if (altusChannel) {
        test(
          "Altus Support Channel",
          "pass",
          "#altus-support channel found (ready for discovery)"
        );
      } else {
        test(
          "Altus Support Channel",
          "warn",
          "#altus-support channel not found - bot may need to be invited"
        );
      }
    } else {
      test("Slack Channels Access", "fail", "Cannot list channels");
    }
  } catch (error: any) {
    test("Slack Connection", "fail", `Error: ${error.message}`);
  }
}

/**
 * Test ServiceNow connection
 */
async function testServiceNowConnection() {
  console.log(`\n🔗 Testing ServiceNow Connection...\n`);

  if (!serviceNowClient.isConfigured()) {
    test(
      "ServiceNow Connection",
      "fail",
      "Cannot test - ServiceNow credentials missing"
    );
    return;
  }

  try {
    // Test CMDB search
    const results = await serviceNowClient.searchConfigurationItems({
      name: "test",
      limit: 1,
    });

    test("ServiceNow CMDB Access", "pass", "Can query CMDB table");

    // Test for Altus CIs
    const altusResults = await serviceNowClient.searchConfigurationItems({
      name: "altus",
      limit: 10,
    });

    if (altusResults.length > 0) {
      test(
        "Altus CIs in CMDB",
        "pass",
        `Found ${altusResults.length} existing Altus CI(s)`
      );
    } else {
      test(
        "Altus CIs in CMDB",
        "warn",
        "No Altus CIs found - this is expected for new pilot"
      );
    }

    // Test for 10.252.0.40 specifically
    const fileServerResults =
      await serviceNowClient.searchConfigurationItems({
        ipAddress: "10.252.0.40",
        limit: 1,
      });

    if (fileServerResults.length > 0) {
      test(
        "File Server (10.252.0.40)",
        "pass",
        "10.252.0.40 already in CMDB"
      );
    } else {
      test(
        "File Server (10.252.0.40)",
        "warn",
        "10.252.0.40 not in CMDB - good candidate for first CI"
      );
    }
  } catch (error: any) {
    test("ServiceNow Connection", "fail", `Error: ${error.message}`);
  }
}

/**
 * Test scripts are executable
 */
function testScripts() {
  console.log(`\n🔧 Testing Scripts...\n`);

  // Check if pilot script is executable
  try {
    const stats = fs.statSync("scripts/cmdb-pilot-phase1.sh");
    const isExecutable = (stats.mode & 0o111) !== 0;

    if (isExecutable) {
      test(
        "Phase 1 Script Executable",
        "pass",
        "scripts/cmdb-pilot-phase1.sh is executable"
      );
    } else {
      test(
        "Phase 1 Script Executable",
        "warn",
        "Run: chmod +x scripts/cmdb-pilot-phase1.sh"
      );
    }
  } catch (error) {
    test(
      "Phase 1 Script Executable",
      "fail",
      "scripts/cmdb-pilot-phase1.sh not found"
    );
  }
}

/**
 * Test template validation
 */
function testTemplate() {
  console.log(`\n✅ Testing CI Template...\n`);

  try {
    // Load template
    const templatePath = "templates/cmdb-ci-template.json";
    const templateContent = fs.readFileSync(templatePath, "utf-8");
    const template = JSON.parse(templateContent);

    if (template.$schema && template.properties) {
      test("CI Template Schema", "pass", "Template has valid JSON schema");
    } else {
      test("CI Template Schema", "fail", "Template missing schema structure");
    }

    // Test example against template
    const examplePath = "examples/altus-file-server-example.json";
    const exampleContent = fs.readFileSync(examplePath, "utf-8");
    const example = JSON.parse(exampleContent);

    // Check required fields from template
    const requiredFields = template.required || [];
    let missingFields = 0;

    for (const field of requiredFields) {
      if (!example[field]) {
        missingFields++;
      }
    }

    if (missingFields === 0) {
      test(
        "Example CI Validation",
        "pass",
        "Example has all required fields"
      );
    } else {
      test(
        "Example CI Validation",
        "fail",
        `Example missing ${missingFields} required field(s)`
      );
    }
  } catch (error: any) {
    test("Template Validation", "fail", `Error: ${error.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n╔════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║              CMDB Pilot Setup Test                                    ║`);
  console.log(`║              Altus Infrastructure                                      ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════════╝`);

  testEnvironment();
  testFileStructure();
  await testSlackConnection();
  await testServiceNowConnection();
  testScripts();
  testTemplate();

  const exitCode = printResults();
  process.exit(exitCode);
}

// Run if executed directly
if (require.main === module) {
  main();
}
