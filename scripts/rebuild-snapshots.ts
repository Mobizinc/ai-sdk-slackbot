/**
 * Rebuild Snapshots 0022-0027 Incrementally
 * Creates proper snapshot chain reflecting true schema evolution
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const metaDir = path.join(__dirname, "..", "migrations", "meta");

function rebuildSnapshots() {
  console.log("🔄 Rebuilding snapshots 0022-0027 incrementally...\n");

  // Step 1: Fix snapshot 0022 - remove tables added in later migrations
  console.log("Step 1: Fixing snapshot 0022 (remove future tables)");
  const snapshot0021 = JSON.parse(fs.readFileSync(path.join(metaDir, "0021_snapshot.json"), "utf-8"));
  const snapshot0022Current = JSON.parse(fs.readFileSync(path.join(metaDir, "0022_snapshot.json"), "utf-8"));

  // Migration 0022 only adds github columns to projects table
  // Start from 0021 and apply just that change
  const snapshot0022 = JSON.parse(JSON.stringify(snapshot0021)); // deep copy

  // Generate new ID for 0022
  snapshot0022.id = randomUUID();
  snapshot0022.prevId = snapshot0021.id;

  // Add github columns to projects table (migration 0022)
  if (snapshot0022.tables["public.projects"]) {
    snapshot0022.tables["public.projects"].columns["github_repo"] = {
      name: "github_repo",
      type: "text",
      primaryKey: false,
      notNull: false,
    };
    snapshot0022.tables["public.projects"].columns["github_default_branch"] = {
      name: "github_default_branch",
      type: "text",
      primaryKey: false,
      notNull: false,
    };
  }

  fs.writeFileSync(
    path.join(metaDir, "0022_snapshot.json"),
    JSON.stringify(snapshot0022, null, 2)
  );
  console.log(`✅ Rebuilt 0022_snapshot.json (27 tables, added github columns)`);
  console.log(`   ID: ${snapshot0022.id.substring(0, 12)}...`);
  console.log(`   prevId: ${snapshot0022.prevId.substring(0, 12)}...\n`);

  // Step 2: Build snapshot 0023 - add change_validations table
  console.log("Step 2: Building snapshot 0023 (add change_validations)");
  const snapshot0023 = JSON.parse(JSON.stringify(snapshot0022)); // start from 0022
  snapshot0023.id = randomUUID();
  snapshot0023.prevId = snapshot0022.id;

  // Add change_validations table from current 0022 snapshot (which has the correct structure)
  if (snapshot0022Current.tables["public.change_validations"]) {
    snapshot0023.tables["public.change_validations"] =
      snapshot0022Current.tables["public.change_validations"];
  }

  fs.writeFileSync(
    path.join(metaDir, "0023_snapshot.json"),
    JSON.stringify(snapshot0023, null, 2)
  );
  console.log(`✅ Built 0023_snapshot.json (28 tables, added change_validations)`);
  console.log(`   ID: ${snapshot0023.id.substring(0, 12)}...`);
  console.log(`   prevId: ${snapshot0023.prevId.substring(0, 12)}...\n`);

  // Step 3: Build snapshot 0024 - alter change_validations (add constraint)
  console.log("Step 3: Building snapshot 0024 (alter change_validations)");
  const snapshot0024 = JSON.parse(JSON.stringify(snapshot0023)); // start from 0023
  snapshot0024.id = randomUUID();
  snapshot0024.prevId = snapshot0023.id;

  // Migration 0024 adds constraint and index - update checkConstraints
  if (snapshot0024.tables["public.change_validations"]) {
    snapshot0024.tables["public.change_validations"].checkConstraints = {
      valid_component_types: {
        name: "valid_component_types",
        value: "((component_type = ANY (ARRAY['catalog_item'::text, 'ldap_server'::text, 'mid_server'::text, 'workflow'::text, 'std_change_template'::text, 'cmdb_ci'::text])))",
      },
    };

    // Add composite index
    snapshot0024.tables["public.change_validations"].indexes = {
      ...snapshot0024.tables["public.change_validations"].indexes,
      idx_change_validations_template_type: {
        name: "idx_change_validations_template_type",
        columns: [
          { expression: "component_type", isExpression: false, asc: true, nulls: "last" },
          { expression: "component_sys_id", isExpression: false, asc: true, nulls: "last" },
        ],
        isUnique: false,
        concurrently: false,
        method: "btree",
        with: {},
      },
    };
  }

  fs.writeFileSync(
    path.join(metaDir, "0024_snapshot.json"),
    JSON.stringify(snapshot0024, null, 2)
  );
  console.log(`✅ Built 0024_snapshot.json (28 tables, updated change_validations constraints)`);
  console.log(`   ID: ${snapshot0024.id.substring(0, 12)}...`);
  console.log(`   prevId: ${snapshot0024.prevId.substring(0, 12)}...\n`);

  // Step 4: Build snapshot 0025 - add project_interests table
  console.log("Step 4: Building snapshot 0025 (add project_interests)");
  const snapshot0025 = JSON.parse(JSON.stringify(snapshot0024)); // start from 0024
  snapshot0025.id = randomUUID();
  snapshot0025.prevId = snapshot0024.id;

  // Add project_interests table and update project_interviews
  if (snapshot0022Current.tables["public.project_interests"]) {
    snapshot0025.tables["public.project_interests"] =
      snapshot0022Current.tables["public.project_interests"];
  }

  // Add new columns to project_interviews (from migration 0025)
  if (snapshot0025.tables["public.project_interviews"]) {
    snapshot0025.tables["public.project_interviews"].columns["skill_gaps"] = {
      name: "skill_gaps",
      type: "jsonb",
      primaryKey: false,
      notNull: true,
      default: "'[]'::jsonb",
    };
    snapshot0025.tables["public.project_interviews"].columns["onboarding_recommendations"] = {
      name: "onboarding_recommendations",
      type: "jsonb",
      primaryKey: false,
      notNull: true,
      default: "'[]'::jsonb",
    };
    snapshot0025.tables["public.project_interviews"].columns["strengths"] = {
      name: "strengths",
      type: "jsonb",
      primaryKey: false,
      notNull: true,
      default: "'[]'::jsonb",
    };
    snapshot0025.tables["public.project_interviews"].columns["time_to_productivity"] = {
      name: "time_to_productivity",
      type: "text",
      primaryKey: false,
      notNull: false,
    };
    snapshot0025.tables["public.project_interviews"].columns["interest_id"] = {
      name: "interest_id",
      type: "uuid",
      primaryKey: false,
      notNull: false,
    };

    // Add index
    if (!snapshot0025.tables["public.project_interviews"].indexes) {
      snapshot0025.tables["public.project_interviews"].indexes = {};
    }
    snapshot0025.tables["public.project_interviews"].indexes.idx_project_interviews_interest = {
      name: "idx_project_interviews_interest",
      columns: [{ expression: "interest_id", isExpression: false, asc: true, nulls: "last" }],
      isUnique: false,
      concurrently: false,
      method: "btree",
      with: {},
    };
  }

  fs.writeFileSync(
    path.join(metaDir, "0025_snapshot.json"),
    JSON.stringify(snapshot0025, null, 2)
  );
  console.log(`✅ Built 0025_snapshot.json (29 tables, added project_interests)`);
  console.log(`   ID: ${snapshot0025.id.substring(0, 12)}...`);
  console.log(`   prevId: ${snapshot0025.prevId.substring(0, 12)}...\n`);

  // Step 5: Build snapshot 0026 - no schema change (just extension)
  console.log("Step 5: Building snapshot 0026 (no schema change, pgvector extension)");
  const snapshot0026 = JSON.parse(JSON.stringify(snapshot0025)); // same schema as 0025
  snapshot0026.id = randomUUID();
  snapshot0026.prevId = snapshot0025.id;

  fs.writeFileSync(
    path.join(metaDir, "0026_snapshot.json"),
    JSON.stringify(snapshot0026, null, 2)
  );
  console.log(`✅ Built 0026_snapshot.json (29 tables, no schema changes)`);
  console.log(`   ID: ${snapshot0026.id.substring(0, 12)}...`);
  console.log(`   prevId: ${snapshot0026.prevId.substring(0, 12)}...\n`);

  // Step 6: Build snapshot 0027 - add muscle_memory_exemplars and exemplar_quality_signals
  console.log("Step 6: Building snapshot 0027 (add muscle memory tables)");
  const snapshot0027 = JSON.parse(JSON.stringify(snapshot0026)); // start from 0026
  snapshot0027.id = randomUUID();
  snapshot0027.prevId = snapshot0026.id;

  // Add muscle memory tables
  if (snapshot0022Current.tables["public.muscle_memory_exemplars"]) {
    snapshot0027.tables["public.muscle_memory_exemplars"] =
      snapshot0022Current.tables["public.muscle_memory_exemplars"];
  }
  if (snapshot0022Current.tables["public.exemplar_quality_signals"]) {
    snapshot0027.tables["public.exemplar_quality_signals"] =
      snapshot0022Current.tables["public.exemplar_quality_signals"];
  }

  fs.writeFileSync(
    path.join(metaDir, "0027_snapshot.json"),
    JSON.stringify(snapshot0027, null, 2)
  );
  console.log(`✅ Built 0027_snapshot.json (31 tables, added muscle memory tables)`);
  console.log(`   ID: ${snapshot0027.id.substring(0, 12)}...`);
  console.log(`   prevId: ${snapshot0027.prevId.substring(0, 12)}...\n`);

  console.log("✅ All snapshots rebuilt successfully");
  console.log("\n📊 Final table counts:");
  console.log("   0021: 27 tables");
  console.log("   0022: 27 tables (+ github columns)");
  console.log("   0023: 28 tables (+ change_validations)");
  console.log("   0024: 28 tables (change_validations altered)");
  console.log("   0025: 29 tables (+ project_interests)");
  console.log("   0026: 29 tables (pgvector extension only)");
  console.log("   0027: 31 tables (+ muscle_memory tables)");
}

rebuildSnapshots();
