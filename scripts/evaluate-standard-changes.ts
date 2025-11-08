import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  ServiceNowChangeWebhookSchema,
  detectComponentType,
  extractDocumentationFields,
  type ServiceNowChangeWebhook,
} from '../lib/schemas/servicenow-change-webhook';
import { ServiceNowParser } from '../lib/utils/servicenow-parser';

const serviceNowParser = new ServiceNowParser();

type ChangeBundle = {
  metadata?: {
    change_number?: string;
    change_sys_id?: string;
  };
  change_request: Record<string, any>;
  component_references?: Array<Record<string, any>>;
};

type EvaluationResult = {
  change_number: string;
  component_type?: string;
  component_sys_id?: string;
  overall_status?: string;
  documentation_assessment?: string;
  risks?: string[];
  required_actions?: string[];
  checks?: Record<string, boolean>;
  synthesis?: string;
  error?: string;
  duration_ms: number;
};

function toStringValue(field: any): string | undefined {
  if (field === null || field === undefined) return undefined;
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (typeof field === 'boolean') return field ? 'true' : 'false';
  if (typeof field === 'object') {
    return field.value || field.display_value || field.sys_id || field.name || undefined;
  }
  return undefined;
}

function buildTemplateVersion(changeRequest: Record<string, any>) {
  const version = changeRequest.std_change_producer_version;
  if (!version?.value) {
    return undefined;
  }
  return {
    value: version.value,
    display_value: version.display_value || undefined,
  };
}

function buildCmdbCi(changeRequest: Record<string, any>) {
  const cmdb = changeRequest.cmdb_ci;
  if (!cmdb?.value && !cmdb?.sys_id) {
    return undefined;
  }

  return {
    sys_id: cmdb.value || cmdb.sys_id,
    name: cmdb.display_value || cmdb.name || undefined,
    sys_class_name: cmdb.sys_class_name?.value || cmdb.sys_class_name || undefined,
  };
}

function determineComponentInfo(
  bundle: ChangeBundle,
  templateVersion?: { value: string },
  cmdbCi?: { sys_id: string },
): { component_type: 'cmdb_ci' | 'std_change_template' | 'catalog_item'; component_sys_id?: string } {
  if (templateVersion?.value) {
    return {
      component_type: 'std_change_template',
      component_sys_id: templateVersion.value,
    };
  }

  if (cmdbCi?.sys_id) {
    return {
      component_type: 'cmdb_ci',
      component_sys_id: cmdbCi.sys_id,
    };
  }

  const firstComponent = bundle.component_references?.find((ref) => {
    const ciItem = ref?.ci_item;
    if (!ciItem) return false;
    if (typeof ciItem === 'string') return ciItem.length > 0;
    return Boolean(ciItem.value || ciItem.sys_id || ciItem.display_value);
  });

  if (firstComponent?.ci_item) {
    const ciItem = firstComponent.ci_item;
    const refSysId =
      typeof ciItem === 'string'
        ? ciItem
        : ciItem.value || ciItem.sys_id || ciItem.display_value;

    if (refSysId) {
      return {
        component_type: 'cmdb_ci',
        component_sys_id: refSysId,
      };
    }
  }

  const catalogRef = bundle.change_request.catalog_item;
  const fallbackComponent =
    (typeof catalogRef === 'string' ? catalogRef : catalogRef?.value || catalogRef?.sys_id) ||
    undefined;

  if (fallbackComponent) {
    return {
      component_type: 'catalog_item',
      component_sys_id: fallbackComponent,
    };
  }

  return {
    component_type: 'catalog_item',
    component_sys_id: undefined,
  };
}

function buildWebhookPayload(bundle: ChangeBundle): ServiceNowChangeWebhook {
  const changeRequest = bundle.change_request;
  const changeNumber =
    toStringValue(changeRequest.number) || bundle.metadata?.change_number || 'UNKNOWN';
  const changeSysId =
    toStringValue(changeRequest.sys_id) || bundle.metadata?.change_sys_id || 'UNKNOWN';
  const submittedBy =
    toStringValue(changeRequest.sys_created_by) ||
    toStringValue(changeRequest.requested_by) ||
    'unknown@mobizinc.com';
  const state = toStringValue(changeRequest.state) || 'Assess';
  const shortDescription = toStringValue(changeRequest.short_description);
  const description = toStringValue(changeRequest.description);
  const implementationPlan = toStringValue(changeRequest.implementation_plan);
  const rollbackPlan =
    toStringValue(changeRequest.rollback_plan) || toStringValue(changeRequest.back_out_plan);
  const testPlan = toStringValue(changeRequest.test_plan) || toStringValue(changeRequest.testing_plan);
  const justification =
    toStringValue(changeRequest.justification) ||
    toStringValue(changeRequest.business_justification);

  const templateVersion = buildTemplateVersion(changeRequest);
  const cmdbCi = buildCmdbCi(changeRequest);
  const componentInfo = determineComponentInfo(bundle, templateVersion, cmdbCi);

  const rawPayload = {
    change_sys_id: changeSysId,
    change_number: changeNumber,
    state,
    component_type: componentInfo.component_type,
    component_sys_id: componentInfo.component_sys_id,
    submitted_by: submittedBy,
    short_description: shortDescription,
    description,
    implementation_plan: implementationPlan,
    rollback_plan: rollbackPlan,
    test_plan: testPlan,
    justification,
    ...(templateVersion ? { std_change_producer_version: templateVersion } : {}),
    ...(cmdbCi ? { cmdb_ci: cmdbCi } : {}),
  };

  const parsedWebhook = serviceNowParser.parse(JSON.stringify(rawPayload));
  if (!parsedWebhook.success || !parsedWebhook.data) {
    throw new Error(
      `Failed to parse webhook payload for ${changeNumber}: ${
        parsedWebhook.error ? parsedWebhook.error.message : 'Unknown parser error'
      }`
    );
  }

  const basePayload: ServiceNowChangeWebhook = ServiceNowChangeWebhookSchema.parse(parsedWebhook.data);

  const detected = detectComponentType(basePayload);
  return {
    ...basePayload,
    component_type: detected.type,
    component_sys_id: detected.sysId,
  };
}

function readChangeFiles(
  limit: number,
  snapshot?: string,
  offset: number = 0,
  includeNumbers?: Set<string>
): { snapshot: string; changes: ChangeBundle[] } {
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

  const snapshotToUse = snapshot && snapshots.includes(snapshot) ? snapshot : snapshots[0];
  if (snapshot && snapshotToUse !== snapshot) {
    throw new Error(`Snapshot ${snapshot} not found under backup/standard-changes`);
  }

  const changesDir = path.join(backupRoot, snapshotToUse, 'changes');
  if (!fs.existsSync(changesDir)) {
    throw new Error(`Missing changes directory: ${changesDir}`);
  }

  let files = fs
    .readdirSync(changesDir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  if (includeNumbers && includeNumbers.size > 0) {
    files = files.filter((file) => includeNumbers.has(file.replace(/\.json$/i, '')));
  }

  if (offset > 0) {
    files = files.slice(offset);
  }

  if (limit > 0) {
    files = files.slice(0, limit);
  }

  const changes = files.map((file) =>
    JSON.parse(fs.readFileSync(path.join(changesDir, file), 'utf8')) as ChangeBundle
  );

  return { snapshot: snapshotToUse, changes };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const offsetArg = args.find((arg) => arg.startsWith('--offset='));
  const changesArg = args.find((arg) => arg.startsWith('--changes='));
  const snapshotArg = args.find((arg) => arg.startsWith('--snapshot='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5;
  const offset = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 0;
  const includeNumbers = changesArg
    ? new Set(
        changesArg
          .split('=')[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : undefined;
  const snapshot = snapshotArg ? snapshotArg.split('=')[1] : undefined;

  console.log('Evaluate Standard Changes');
  console.log('='.repeat(80));
  console.log(`Dry run: ${dryRun ? 'YES' : 'NO'}`);
  console.log(`Limit: ${limit > 0 ? limit : 'all'}`);
  if (offset > 0) {
    console.log(`Offset: ${offset}`);
  }
  if (includeNumbers && includeNumbers.size > 0) {
    console.log(`Changes: ${Array.from(includeNumbers).join(', ')}`);
  }
  if (snapshot) {
    console.log(`Snapshot: ${snapshot}`);
  }
  console.log('');

  const { snapshot: resolvedSnapshot, changes } = readChangeFiles(
    limit,
    snapshot,
    offset,
    includeNumbers
  );
  const { getChangeValidationService } = await import('../lib/services/change-validation');
  const { getChangeValidationRepository } = await import('../lib/db/repositories/change-validation-repository');
  const service = getChangeValidationService();
  const repository = getChangeValidationRepository();
  const summary: EvaluationResult[] = [];

  for (const [index, bundle] of changes.entries()) {
    const start = Date.now();
    let payload: ServiceNowChangeWebhook | null = null;
    let result: EvaluationResult | null = null;

    try {
      payload = buildWebhookPayload(bundle);

      result = {
        change_number: payload.change_number,
        component_type: payload.component_type,
        component_sys_id: payload.component_sys_id,
        duration_ms: 0,
      };

      console.log(
        `[${index + 1}/${changes.length}] ${payload.change_number} -> ${payload.component_type} (${payload.component_sys_id || 'n/a'})`
      );

      if (dryRun) {
        console.log('  Payload Preview:', JSON.stringify(payload, null, 2));
        summary.push(result);
        continue;
      }

      const existing = await repository.getByChangeSysId(payload.change_sys_id);

      if (!existing) {
        await service.receiveWebhook(payload, undefined, payload.submitted_by);
      } else {
        const archivedDocs = extractDocumentationFields(payload);
        await repository.update(payload.change_sys_id, {
          changeNumber: payload.change_number,
          componentType: payload.component_type,
          componentSysId: payload.component_sys_id,
          payload: {
            ...payload,
            archived_documentation: archivedDocs,
          } as Record<string, any>,
          requestedBy: payload.submitted_by,
          status: 'received',
          validationResults: null,
          failureReason: null,
          processedAt: null,
          processingTimeMs: null,
          retryCount: 0,
        });
      }

      const verdict = await service.processValidation(payload.change_sys_id);

      Object.assign(result, verdict);

      console.log(
        `  ✅ Verdict: ${verdict.overall_status} | ${verdict.synthesis ?? 'No synthesis provided'}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!result && payload) {
        result = {
          change_number: payload.change_number,
          component_type: payload.component_type,
          component_sys_id: payload.component_sys_id,
          duration_ms: 0,
        };
      } else if (!result) {
        result = {
          change_number: 'UNKNOWN',
          duration_ms: 0,
        };
      }
      result.error = errorMessage;
      console.error(`  ❌ Failed to evaluate ${result.change_number}: ${errorMessage}`);
    } finally {
      if (result) {
        result.duration_ms = Date.now() - start;
        summary.push(result);
      }
    }
  }

  const outPath = path.join(
    process.cwd(),
    'backup',
    'standard-changes',
    `evaluation_summary_${resolvedSnapshot}_${Date.now()}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log('\nSummary saved to', outPath);
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
