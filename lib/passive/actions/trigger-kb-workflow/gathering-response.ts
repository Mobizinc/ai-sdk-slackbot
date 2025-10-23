
import type { CaseContext } from "../../../../context-manager";
import { getKBStateMachine, KBState } from "../../../../services/kb-state-machine";
import { getCaseQualityAnalyzer } from "../../../../services/case-quality-analyzer";
import type { TriggerKBWorkflowDeps } from "./deps";
import { generateAndPostKB, abandonGathering } from "./generation";
import { askFollowUpQuestions } from "./gathering";

export async function handleUserResponse(
  deps: TriggerKBWorkflowDeps,
  context: CaseContext,
  responseText: string,
): Promise<void> {
  const stateMachine = getKBStateMachine();
  const { caseNumber, threadTs, channelId } = context;

  console.log(`[KB Generation] Processing user response for ${caseNumber}...`);

  stateMachine.addUserResponse(caseNumber, threadTs, responseText);

  const caseDetails = await deps.caseData.getCase(caseNumber);
  const analyzer = getCaseQualityAnalyzer();
  const newAssessment = await analyzer(context, caseDetails);

  stateMachine.storeAssessment(
    caseNumber,
    threadTs,
    newAssessment.score,
    newAssessment.missingInfo,
  );

  console.log(
    `[KB Generation] Re-assessment: ${newAssessment.decision} (score: ${newAssessment.score})`,
  );

  if (newAssessment.decision === "high_quality") {
    stateMachine.setState(caseNumber, threadTs, KBState.GENERATING);
    await generateAndPostKB(deps, {
      caseNumber,
      channelId,
      threadTs,
      context,
      caseDetails,
    });
    return;
  }

  if (stateMachine.hasReachedMaxAttempts(caseNumber, threadTs)) {
    await abandonGathering(deps, caseNumber, channelId, threadTs);
    return;
  }

  await askFollowUpQuestions(deps, {
    caseNumber,
    channelId,
    threadTs,
    assessment: newAssessment,
    context,
  });
}
