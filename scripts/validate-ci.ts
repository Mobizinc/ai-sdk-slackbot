#!/usr/bin/env ts-node
/**
 * CI Validation Script
 *
 * Validates CI JSON files against the CMDB CI template schema.
 * Helps ensure manually created CI records are complete and correct.
 *
 * Usage:
 *   ts-node scripts/validate-ci.ts examples/altus-file-server-example.json
 *   ts-node scripts/validate-ci.ts examples/*.json
 */

import * as fs from "fs";
import * as path from "path";

interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

const REQUIRED_FIELDS = ["name", "type", "support_team"];

const IMPORTANT_FIELDS = [
  "ip_addresses",
  "location",
  "purpose",
  "primary_users",
  "tags",
];

const VALID_TYPES = [
  "File Server",
  "Application Server",
  "Domain Controller",
  "Router",
  "Switch",
  "Firewall",
  "Load Balancer",
  "Database Server",
  "Virtual Machine",
  "Network Attached Storage",
  "Application",
  "Service",
  "Other",
];

const VALID_STATUSES = [
  "Active",
  "Inactive",
  "Planned",
  "Retired",
  "Under Maintenance",
];

const VALID_ENVIRONMENTS = [
  "Production",
  "Test",
  "Development",
  "Staging",
  "DR",
];

const VALID_CRITICALITIES = ["Critical", "High", "Medium", "Low"];

/**
 * Validate IP address format
 */
function isValidIP(ip: string): boolean {
  const ipPattern =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipPattern.test(ip);
}

/**
 * Validate URL format
 */
function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate naming convention (Customer-Function-Location)
 */
function hasGoodNamingConvention(name: string): boolean {
  // Should have at least 2 hyphens for Customer-Function-Location pattern
  const parts = name.split("-");
  return parts.length >= 3;
}

/**
 * Validate a single CI record
 */
function validateCI(ciData: any, filename: string): ValidationResult {
  const result: ValidationResult = {
    file: filename,
    valid: true,
    errors: [],
    warnings: [],
    score: 100,
  };

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!ciData[field]) {
      result.errors.push(`Missing required field: ${field}`);
      result.valid = false;
      result.score -= 20;
    }
  }

  // Validate name
  if (ciData.name) {
    if (ciData.name.length < 5) {
      result.errors.push("Name too short (minimum 5 characters)");
      result.valid = false;
      result.score -= 10;
    }

    if (!hasGoodNamingConvention(ciData.name)) {
      result.warnings.push(
        "Name doesn't follow Customer-Function-Location convention"
      );
      result.score -= 5;
    }
  }

  // Validate type
  if (ciData.type && !VALID_TYPES.includes(ciData.type)) {
    result.errors.push(
      `Invalid type: ${ciData.type}. Must be one of: ${VALID_TYPES.join(", ")}`
    );
    result.valid = false;
    result.score -= 10;
  }

  // Validate support_team
  if (ciData.support_team) {
    if (!ciData.support_team.primary) {
      result.errors.push("support_team.primary is required");
      result.valid = false;
      result.score -= 10;
    }

    if (!ciData.support_team.contact) {
      result.warnings.push("support_team.contact is recommended");
      result.score -= 5;
    }
  }

  // Validate IP addresses
  if (ciData.ip_addresses) {
    if (!Array.isArray(ciData.ip_addresses)) {
      result.errors.push("ip_addresses must be an array");
      result.valid = false;
      result.score -= 10;
    } else {
      for (const ip of ciData.ip_addresses) {
        if (!isValidIP(ip)) {
          result.errors.push(`Invalid IP address format: ${ip}`);
          result.valid = false;
          result.score -= 5;
        }
      }
    }
  }

  // Validate status
  if (ciData.status && !VALID_STATUSES.includes(ciData.status)) {
    result.errors.push(
      `Invalid status: ${ciData.status}. Must be one of: ${VALID_STATUSES.join(", ")}`
    );
    result.valid = false;
    result.score -= 5;
  }

  // Validate environment
  if (ciData.environment && !VALID_ENVIRONMENTS.includes(ciData.environment)) {
    result.errors.push(
      `Invalid environment: ${ciData.environment}. Must be one of: ${VALID_ENVIRONMENTS.join(", ")}`
    );
    result.valid = false;
    result.score -= 5;
  }

  // Validate criticality
  if (
    ciData.criticality &&
    !VALID_CRITICALITIES.includes(ciData.criticality)
  ) {
    result.errors.push(
      `Invalid criticality: ${ciData.criticality}. Must be one of: ${VALID_CRITICALITIES.join(", ")}`
    );
    result.valid = false;
    result.score -= 5;
  }

  // Check important fields (warnings only)
  for (const field of IMPORTANT_FIELDS) {
    if (!ciData[field] || (Array.isArray(ciData[field]) && ciData[field].length === 0)) {
      result.warnings.push(`Missing recommended field: ${field}`);
      result.score -= 3;
    }
  }

  // Validate purpose length
  if (ciData.purpose) {
    if (ciData.purpose.length < 20) {
      result.warnings.push(
        "Purpose description is very short - consider adding more detail for troubleshooting context"
      );
      result.score -= 5;
    }
  } else {
    result.warnings.push(
      "Purpose field missing - this is critical for AI searchability"
    );
    result.score -= 10;
  }

  // Validate tags
  if (ciData.tags) {
    if (!Array.isArray(ciData.tags)) {
      result.errors.push("tags must be an array");
      result.valid = false;
      result.score -= 5;
    } else if (ciData.tags.length < 3) {
      result.warnings.push(
        "Consider adding more tags (minimum 3-5) for better AI searchability"
      );
      result.score -= 5;
    }
  }

  // Validate documentation links
  if (ciData.documentation && Array.isArray(ciData.documentation)) {
    for (const doc of ciData.documentation) {
      if (doc.url && !isValidURL(doc.url)) {
        result.errors.push(`Invalid documentation URL: ${doc.url}`);
        result.valid = false;
        result.score -= 3;
      }

      if (!doc.title) {
        result.warnings.push("Documentation entry missing title");
        result.score -= 2;
      }
    }
  }

  // Validate known_issues
  if (ciData.known_issues && Array.isArray(ciData.known_issues)) {
    for (const issue of ciData.known_issues) {
      if (!issue.description) {
        result.warnings.push("Known issue missing description");
        result.score -= 2;
      }

      if (!issue.workaround) {
        result.warnings.push("Known issue missing workaround");
        result.score -= 2;
      }
    }
  }

  // Validate metadata
  if (ciData.metadata) {
    const validCreatedBy = ["human", "ai-draft", "automated"];
    if (
      ciData.metadata.created_by &&
      !validCreatedBy.includes(ciData.metadata.created_by)
    ) {
      result.errors.push(
        `Invalid metadata.created_by: ${ciData.metadata.created_by}. Must be one of: ${validCreatedBy.join(", ")}`
      );
      result.valid = false;
      result.score -= 3;
    }

    const validConfidence = ["HIGH", "MEDIUM", "LOW"];
    if (
      ciData.metadata.confidence &&
      !validConfidence.includes(ciData.metadata.confidence)
    ) {
      result.errors.push(
        `Invalid metadata.confidence: ${ciData.metadata.confidence}. Must be one of: ${validConfidence.join(", ")}`
      );
      result.valid = false;
      result.score -= 3;
    }
  }

  // Ensure score doesn't go below 0
  result.score = Math.max(0, result.score);

  return result;
}

/**
 * Print validation result
 */
function printResult(result: ValidationResult) {
  const statusIcon = result.valid ? "✅" : "❌";
  const scoreColor =
    result.score >= 90 ? "🟢" : result.score >= 70 ? "🟡" : "🔴";

  console.log(`\n${statusIcon} ${result.file}`);
  console.log(`   Score: ${scoreColor} ${result.score}/100`);

  if (result.errors.length > 0) {
    console.log(`\n   ❌ Errors (${result.errors.length}):`);
    result.errors.forEach((error) => {
      console.log(`      • ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log(`\n   ⚠️  Warnings (${result.warnings.length}):`);
    result.warnings.forEach((warning) => {
      console.log(`      • ${warning}`);
    });
  }

  if (result.valid && result.errors.length === 0 && result.warnings.length === 0) {
    console.log(`   ✨ Perfect! No issues found.`);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`\n❌ Usage: ts-node scripts/validate-ci.ts <ci-file.json> [ci-file2.json ...]`);
    console.log(`\nExamples:`);
    console.log(`   ts-node scripts/validate-ci.ts examples/altus-file-server-example.json`);
    console.log(`   ts-node scripts/validate-ci.ts examples/*.json\n`);
    process.exit(1);
  }

  console.log(`\n🔍 CI Validation Tool\n`);
  console.log(`${"=".repeat(80)}\n`);

  const results: ValidationResult[] = [];

  for (const filePath of args) {
    try {
      // Read and parse JSON
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const ciData = JSON.parse(fileContent);

      // Validate
      const result = validateCI(ciData, path.basename(filePath));
      results.push(result);
      printResult(result);
    } catch (error: any) {
      console.log(`\n❌ ${path.basename(filePath)}`);
      console.log(`   Error reading/parsing file: ${error.message}`);
      results.push({
        file: path.basename(filePath),
        valid: false,
        errors: [`Failed to read/parse file: ${error.message}`],
        warnings: [],
        score: 0,
      });
    }
  }

  // Summary
  console.log(`\n${"=".repeat(80)}\n`);
  console.log(`📊 Summary:`);
  console.log(`   Total files: ${results.length}`);
  console.log(
    `   ✅ Valid: ${results.filter((r) => r.valid).length}`
  );
  console.log(
    `   ❌ Invalid: ${results.filter((r) => !r.valid).length}`
  );

  const avgScore =
    results.reduce((sum, r) => sum + r.score, 0) / results.length;
  console.log(`   📈 Average score: ${avgScore.toFixed(1)}/100\n`);

  // Exit with error code if any validation failed
  const hasErrors = results.some((r) => !r.valid);
  process.exit(hasErrors ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main();
}
