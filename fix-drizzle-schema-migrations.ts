import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
import * as fs from "fs";

dotenv.config({ path: '.env.local' });
dotenv.config();

async function fixMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  try {
    console.log("🔧 Fixing Drizzle migration tracking...\n");

    // Step 1: Get all migration SQL files and compute their hashes
    console.log("1. Computing migration hashes...");
    const journal = JSON.parse(fs.readFileSync('migrations/meta/_journal.json', 'utf-8'));
    const migrationHashes: {tag: string, hash: string, when: number}[] = [];

    for (const entry of journal.entries) {
      const sqlFile = `migrations/${entry.tag}.sql`;
      const sqlContent = fs.readFileSync(sqlFile, 'utf-8');
      const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');
      migrationHashes.push({ tag: entry.tag, hash, when: entry.when });
      console.log(`   ${entry.tag} -> ${hash.substring(0, 16)}...`);
    }

    // Step 2: Check what's currently in drizzle.__drizzle_migrations
    console.log("\n2. Current state of drizzle.__drizzle_migrations:");
    const currentMigrations = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    console.log(`   ${currentMigrations.length} migrations tracked`);

    // Step 3: Add missing migrations to drizzle.__drizzle_migrations
    console.log("\n3. Adding missing migrations...");
    const existingHashes = new Set(currentMigrations.map((m: any) => m.hash));

    for (const mig of migrationHashes) {
      if (!existingHashes.has(mig.hash)) {
        await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${mig.hash}, ${mig.when})`;
        console.log(`   ✅ Added ${mig.tag}`);
      } else {
        console.log(`   ⏭️  Skipped ${mig.tag} (already exists)`);
      }
    }

    // Step 4: Drop the incorrect public.__drizzle_migrations table
    console.log("\n4. Cleaning up incorrect migration table...");
    await sql`DROP TABLE IF EXISTS public.__drizzle_migrations`;
    console.log("   ✅ Dropped public.__drizzle_migrations");

    // Step 5: Verify
    console.log("\n5. Verification:");
    const finalMigrations = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    console.log(`   Total migrations in drizzle schema: ${finalMigrations.length}`);
    console.log(`   Expected: ${migrationHashes.length}`);

    if (finalMigrations.length === migrationHashes.length) {
      console.log("\n✅ Migration tracking fixed successfully!");
      console.log("💡 Now run: npm run db:migrate");
    } else {
      console.log("\n⚠️  Warning: Migration count mismatch!");
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }

  process.exit(0);
}

fixMigrations();
