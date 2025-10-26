
import { initializeWorkflow, fetchCaseData, postResolutionSummary } from "./helpers";
import { assessAndRoute } from "./assessment";
import { handleWorkflowError } from "./error";
import type { TriggerKBWorkflowDeps } from "./deps";

export async function triggerWorkflow(
  deps: TriggerKBWorkflowDeps,
  params: {
    caseNumber: string;
    channelId: string;
    threadTs: string;
  },
): Promise<void> {
  const { caseNumber, channelId, threadTs } = params;
  console.log(`[KB Generation] Starting multi-stage process for ${caseNumber}`);

  const context = deps.contextManager.getContextSync(caseNumber, threadTs);
  if (!context) {
    console.log(`[KB Generation] No context found for ${caseNumber}, skipping`);
    return;
  }

  console.log(
    `[KB Generation] Context found with ${context.messages.length} messages`,
  );

  const { caseDetails, journalEntries } = await fetchCaseData(deps, caseNumber);

  await postResolutionSummary(
    deps,
    caseNumber,
    channelId,
    threadTs,
    context,
    caseDetails,
    journalEntries,
  );

  initializeWorkflow(caseNumber, threadTs, channelId);

  try {
    await assessAndRoute(deps, {
      caseNumber,
      channelId,
      threadTs,
      context,
      caseDetails,
    });
  } catch (error) {
    await handleWorkflowError(deps, {
      caseNumber,
      channelId,
      threadTs,
      error,
    });
  }
}
