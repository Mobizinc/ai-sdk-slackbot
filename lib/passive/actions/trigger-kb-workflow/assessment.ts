
import type { CaseContext } from "../../../../context-manager";
import { getKBStateMachine, KBState } from "../../../../services/kb-state-machine";
import { getCaseQualityAnalyzer } from "../../../../services/case-quality-analyzer";
import type { TriggerKBWorkflowDeps } from "./deps";
import { generateAndPostKB } from "./generation";
import { startInteractiveGathering, requestCaseNotes } from "./gathering";

export async function assessAndRoute(
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
  const stateMachine = getKBStateMachine();
  const analyzer = getCaseQualityAnalyzer();
  const assessment = await analyzer(context, caseDetails);

  stateMachine.storeAssessment(
    caseNumber,
    threadTs,
    assessment.score,
    assessment.missingInfo,
  );

  console.log(
    `[KB Generation] Quality: ${assessment.decision} (score: ${assessment.score})`,
  );

  if (assessment.decision === "high_quality") {
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

  if (assessment.decision === "needs_input") {
    await startInteractiveGathering(deps, {
      caseNumber,
      channelId,
      threadTs,
      assessment,
      context,
    });
    return;
  }

  stateMachine.setState(caseNumber, threadTs, KBState.AWAITING_NOTES);
  await requestCaseNotes(deps, {
    caseNumber,
    channelId,
    threadTs,
    assessment,
  });
}
