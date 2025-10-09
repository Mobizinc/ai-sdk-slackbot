#!/usr/bin/env tsx
/**
 * Import business contexts from JSON file into database
 * Usage: tsx scripts/import-business-contexts.ts [--file=path/to/file.json]
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { getDb } from "../lib/db/client";
import { businessContexts } from "../lib/db/schema";
import { eq } from "drizzle-orm";

interface ContactData {
  name: string;
  role: string;
  email?: string;
}

interface BusinessContextData {
  entityName: string;
  entityType: string;
  industry?: string;
  description?: string;
  aliases?: string[];
  relatedEntities?: string[];
  technologyPortfolio?: string;
  serviceDetails?: string;
  keyContacts?: ContactData[];
  slackChannels?: Array<{ name: string; channelId?: string; notes?: string }>;
  cmdbIdentifiers?: Array<{
    ciName?: string;
    sysId?: string;
    ipAddresses?: string[];
    description?: string;
    ownerGroup?: string;
    documentation?: string[];
  }>;
  contextStewards?: Array<{
    type: "channel" | "user" | "usergroup";
    id?: string;
    name?: string;
    notes?: string;
  }>;
  isActive?: boolean;
}

interface ImportData {
  clients: BusinessContextData[];
  vendors: BusinessContextData[];
  platforms: BusinessContextData[];
}

async function importBusinessContexts(filePath: string) {
  console.log(`📥 Importing business contexts from: ${filePath}\n`);

  // Read JSON file
  const jsonData = readFileSync(filePath, "utf-8");
  const data: ImportData = JSON.parse(jsonData);

  // Get database connection
  const db = getDb();
  if (!db) {
    console.error("❌ Database not configured. Set DATABASE_URL environment variable.");
    process.exit(1);
  }

  // Combine all entities
  const allEntities = [
    ...data.clients,
    ...data.vendors,
    ...data.platforms,
  ];

  console.log(`Found ${allEntities.length} entities to import:`);
  console.log(`  - ${data.clients.length} clients`);
  console.log(`  - ${data.vendors.length} vendors`);
  console.log(`  - ${data.platforms.length} platforms\n`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const entity of allEntities) {
    try {
      // Check if entity already exists
      const existing = await db
        .select()
        .from(businessContexts)
        .where(eq(businessContexts.entityName, entity.entityName))
        .limit(1);

      if (existing.length > 0) {
        // Update existing entity
        await db
          .update(businessContexts)
          .set({
            entityType: entity.entityType,
            industry: entity.industry,
            description: entity.description,
            aliases: entity.aliases || [],
            relatedEntities: entity.relatedEntities || [],
            technologyPortfolio: entity.technologyPortfolio,
            serviceDetails: entity.serviceDetails,
            keyContacts: entity.keyContacts || [],
            slackChannels: entity.slackChannels || [],
            cmdbIdentifiers: entity.cmdbIdentifiers || [],
            contextStewards: entity.contextStewards || [],
            isActive: entity.isActive ?? true,
            updatedAt: new Date(),
          })
          .where(eq(businessContexts.entityName, entity.entityName));

        console.log(`✏️  Updated: ${entity.entityName} (${entity.entityType})`);
        updated++;
      } else {
        // Insert new entity
        await db.insert(businessContexts).values({
          entityName: entity.entityName,
          entityType: entity.entityType,
          industry: entity.industry,
          description: entity.description,
          aliases: entity.aliases || [],
          relatedEntities: entity.relatedEntities || [],
          technologyPortfolio: entity.technologyPortfolio,
          serviceDetails: entity.serviceDetails,
          keyContacts: entity.keyContacts || [],
          slackChannels: entity.slackChannels || [],
          cmdbIdentifiers: entity.cmdbIdentifiers || [],
          contextStewards: entity.contextStewards || [],
          isActive: entity.isActive ?? true,
        });

        console.log(`✅ Inserted: ${entity.entityName} (${entity.entityType})`);
        inserted++;
      }
    } catch (error) {
      console.error(`❌ Error importing ${entity.entityName}:`, error);
      skipped++;
    }
  }

  console.log(`\n📊 Import Summary:`);
  console.log(`  ✅ Inserted: ${inserted}`);
  console.log(`  ✏️  Updated: ${updated}`);
  console.log(`  ❌ Skipped: ${skipped}`);
  console.log(`  📦 Total: ${allEntities.length}\n`);

  if (inserted > 0 || updated > 0) {
    console.log("✨ Business contexts imported successfully!");
  }

  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);
let filePath = resolve(__dirname, "../business-contexts.json");

for (const arg of args) {
  if (arg.startsWith("--file=")) {
    filePath = resolve(process.cwd(), arg.replace("--file=", ""));
  } else if (arg === "--help" || arg === "-h") {
    console.log(`
Import Business Contexts

Usage:
  tsx scripts/import-business-contexts.ts [options]

Options:
  --file=<path>    Path to JSON file (default: business-contexts.json)
  --help, -h       Show this help message

Example:
  tsx scripts/import-business-contexts.ts
  tsx scripts/import-business-contexts.ts --file=custom-contexts.json
`);
    process.exit(0);
  }
}

// Run import
importBusinessContexts(filePath).catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
