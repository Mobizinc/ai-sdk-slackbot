import type { CaseContext } from "../../../context-manager";
import { getKBGenerator } from "../../../services/kb-generator";
import { getKBApprovalManager } from "../../../handle-kb-approval";
import { getKBStateMachine, KBState } from "../../../services/kb-state-machine";
import { formatAbandonmentMessage } from "../../../services/interactive-kb-assistant";
import type { TriggerKBWorkflowDeps } from "./deps";
import { getLoadingIndicator } from "../../../utils/loading-indicator";

export async function generateAndPostKB(
  deps: TriggerKBWorkflowDeps,
  params: {
    caseNumber: string;
    channelId: string;
    threadTs: string;
    context: CaseContext;
    caseDetails: unknown;
  },
) {
  const { caseNumber, channelId, threadTs, context, caseDetails } = params;
  const kbGenerator = getKBGenerator();
  const loadingIndicator = getLoadingIndicator();
  let loadingMessageTs: string | undefined;

  try {
    loadingMessageTs = await loadingIndicator.postLoadingMessage(
      channelId,
      threadTs,
      "kb_generation",
    );

    const result = await kbGenerator.generateArticle(context, caseDetails);

    if (result.isDuplicate) {
      if (loadingMessageTs) {
        await loadingIndicator.updateToSuccess(
          loadingMessageTs,
          "Similar KB article already exists",
        );
      }
      await handleDuplicateKB(deps, caseNumber, channelId, threadTs, result);
      return;
    }

    const message = buildKBApprovalMessage(caseNumber, result.article, result.confidence);

    const kbApprovalManager = getKBApprovalManager();
    await kbApprovalManager.postForApproval(
      caseNumber,
      channelId,
      threadTs,
      result.article,
      message,
    );

    if (loadingMessageTs) {
      await loadingIndicator.updateToSuccess(
        loadingMessageTs,
        `KB article generated with ${result.confidence}% confidence`,
      );
    }

    getKBStateMachine().setState(caseNumber, threadTs, KBState.PENDING_APPROVAL);
  } catch (error) {
    if (loadingMessageTs) {
      await loadingIndicator.updateToError(
        loadingMessageTs,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
    throw error;
  }
}

async function handleDuplicateKB(
  deps: TriggerKBWorkflowDeps,
  caseNumber: string,
  channelId: string,
  threadTs: string,
  result: any,
) {
  const similarKBs =
    result.similarExistingKBs
      ?.map((kb: any) => `• <${kb.url}|${kb.number}>: ${kb.title}`)
      .join("\n") || "";

  await deps.slackMessaging.postToThread({
    channel: channelId,
    threadTs,
    text: `✅ *${caseNumber}* is resolved!\n\nℹ️ Similar KB articles already exist:\n${similarKBs}\n\n_Consider updating an existing article instead of creating a new one._`,
    unfurlLinks: false,
  });

  const stateMachine = getKBStateMachine();
  stateMachine.setState(caseNumber, threadTs, KBState.ABANDONED);
  stateMachine.remove(caseNumber, threadTs);
}

export async function abandonGathering(
  deps: TriggerKBWorkflowDeps,
  caseNumber: string,
  channelId: string,
  threadTs: string,
) {
  const stateMachine = getKBStateMachine();
  stateMachine.setState(caseNumber, threadTs, KBState.ABANDONED);

  const message = formatAbandonmentMessage(caseNumber);

  await deps.slackMessaging.postToThread({
    channel: channelId,
    threadTs,
    text: message,
    unfurlLinks: false,
  });

  stateMachine.remove(caseNumber, threadTs);
}

function buildKBApprovalMessage(caseNumber: string, article: any, confidence: number): string {
  let message = `✅ *${caseNumber}* is resolved! I've generated a KB article draft:\n\n`;
  message += `*${article.title}*\n\n`;
  message += `${article.problem.substring(0, 200)}${
    article.problem.length > 200 ? "..." : ""
  }\n\n`;
  message += `_Confidence: ${confidence}% | React with ✅ to publish or ❌ to skip_`;
  return message;
}
