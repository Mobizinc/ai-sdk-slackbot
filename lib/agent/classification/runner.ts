import { getCaseClassifier } from "../../services/case-classifier";
import type {
  ClassificationAgentInput,
  ClassificationAgentOutput,
  ClassificationAgentOptions,
} from "./types";

function deriveDescription(input: ClassificationAgentInput): string {
  if (input.description) {
    return input.description;
  }

  const slackMessages = input.discoveryPack.slackRecent?.messages ?? [];
  const latest = slackMessages.find((msg) => msg.role === "user");
  if (latest?.text) {
    return `${input.shortDescription}\nRecent Slack update: ${latest.text}`;
  }

  return input.shortDescription;
}

function deriveCompanyName(input: ClassificationAgentInput): string | undefined {
  return input.companyName ?? input.discoveryPack.metadata.companyName;
}

export async function runClassificationAgent(
  input: ClassificationAgentInput,
  options?: ClassificationAgentOptions
): Promise<ClassificationAgentOutput> {
  const classifier = options?.classifier ?? getCaseClassifier();

  return classifier.classifyCaseEnhanced({
    case_number: input.caseNumber,
    sys_id: input.sysId,
    short_description: input.shortDescription,
    description: deriveDescription(input),
    assignment_group: input.assignmentGroup,
    urgency: input.urgency,
    priority: input.priority,
    current_category: input.currentCategory,
    company: input.companySysId,
    company_name: deriveCompanyName(input),
    state: input.state,
    client_scope_policy: input.discoveryPack.clientScopePolicy ?? undefined,
  });
}
