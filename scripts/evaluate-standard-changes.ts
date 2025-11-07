import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

type ChangeValidation = import('../lib/db/schema').ChangeValidation;

type ChangeBundle = {
  change_request: Record<string, any>;
  component_references: any[];
};

type EvaluationResult = {
  change_number: string;
  overall_status?: string;
  checks?: Record<string, boolean>;
  synthesis?: string;
  error?: string;
  duration_ms: number;
};

function readChangeFiles(limit: number): ChangeBundle[] {
  const backupRoot = path.join(process.cwd(), 'backup', 'standard-changes');
  if (!fs.existsSync(backupRoot)) {
    throw new Error(`Backup root missing: ${backupRoot}`);
  }

  const snapshots = fs
    .readdirSync(backupRoot)
    .filter((dir) => fs.statSync(path.join(backupRoot, dir)).isDirectory())
    .sort()
    .reverse();

  if (snapshots.length === 0) {
    throw new Error('No snapshots found under backup/standard-changes');
  }

  const latest = snapshots[0];
  const changesDir = path.join(backupRoot, latest, 'changes');
  if (!fs.existsSync(changesDir)) {
    throw new Error(`Missing changes directory: ${changesDir}`);
  }

  const files = fs
    .readdirSync(changesDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .slice(0, limit > 0 ? limit : undefined);

  return files.map((file) =>
    JSON.parse(fs.readFileSync(path.join(changesDir, file), 'utf8')) as ChangeBundle
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5;

  console.log('Evaluate Standard Changes');
  console.log('='.repeat(80));
  console.log(`Dry run: ${dryRun ? 'YES' : 'NO'}`);
  console.log(`Limit: ${limit > 0 ? limit : 'all'}`);
  console.log('');

  const changes = readChangeFiles(limit);
  const { getChangeValidationService } = await import('../lib/services/change-validation');
  const service = getChangeValidationService();
  const summary: EvaluationResult[] = [];

  for (const [index, bundle] of changes.entries()) {
    const changeNumber =
      bundle.change_request.number?.display_value || bundle.change_request.number || 'UNKNOWN';
    const changeSysId =
      bundle.change_request.sys_id?.value ||
      bundle.change_request.sys_id?.display_value ||
      bundle.change_request.sys_id ||
      '';
    const componentSysId =
      bundle.change_request.std_change_producer_version?.value ||
      bundle.component_references[0]?.ci_item?.value ||
      bundle.component_references[0]?.ci_item ||
      '';
    const state =
      bundle.change_request.state?.value ||
      bundle.change_request.state?.display_value ||
      bundle.change_request.state ||
      '';
    const submittedBy =
      bundle.change_request.sys_created_by?.display_value ||
      bundle.change_request.sys_created_by ||
      'unknown@mobizinc.com';

    const result: EvaluationResult = {
      change_number: changeNumber,
      duration_ms: 0,
    };

    const start = Date.now();

    try {
      const payload = {
        change_sys_id: changeSysId,
        change_number: changeNumber,
        state,
        component_type: 'catalog_item',
        component_sys_id: componentSysId,
        submitted_by: submittedBy,
      };

      if (dryRun) {
        console.log(`[${index + 1}/${changes.length}] ${changeNumber}`);
        console.log('  Payload:', JSON.stringify(payload, null, 2));
        summary.push(result);
        continue;
      }

      const record: ChangeValidation = {
        id: randomUUID(),
        changeNumber,
        changeSysId,
        componentType: 'catalog_item',
        componentSysId: componentSysId || null,
        payload,
        hmacSignature: null,
        requestedBy: submittedBy,
        status: 'received',
        validationResults: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
        processingTimeMs: null,
        retryCount: 0,
      };

      const facts = await (service as any).collectValidationFacts(record);
      const verdict = await (service as any).synthesizeWithClaude(record, facts);

      result.overall_status = verdict.overall_status;
      result.checks = verdict.checks;
      result.synthesis = verdict.synthesis;
      console.log(`[${index + 1}/${changes.length}] ${changeNumber} → ${verdict.overall_status}`);
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.error(`[${index + 1}/${changes.length}] ${changeNumber} ❌`, result.error);
    } finally {
      result.duration_ms = Date.now() - start;
      summary.push(result);
    }
  }

  const outPath = path.join(
    process.cwd(),
    'backup',
    'standard-changes',
    `evaluation_summary_${Date.now()}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log('\nSummary saved to', outPath);
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
