import type { CaseData } from "../../../services/case-classifier";
import type { BusinessEntityContext } from "../../../services/business-context-service";
import type { SimilarCaseResult } from "../../../schemas/servicenow-webhook";
import type { KBArticle } from "../../../services/kb-article-search";
import type { MuscleMemoryExemplarSummary } from "../../../services/muscle-memory";

export interface StageContext {
  caseData: CaseData;
  businessContext?: BusinessEntityContext | null;
  similarCases?: SimilarCaseResult[];
  kbArticles?: KBArticle[];
  muscleMemoryExemplars?: MuscleMemoryExemplarSummary[];
}

export function buildSharedContext(context: StageContext): string {
  const sections: string[] = [];
  sections.push(formatCaseData(context.caseData));

  const business = formatBusinessContext(context.businessContext);
  if (business) {
    sections.push(business);
  }

  const similarCases = formatSimilarCases(context.similarCases);
  if (similarCases) {
    sections.push(similarCases);
  }

  const kbArticles = formatKbArticles(context.kbArticles);
  if (kbArticles) {
    sections.push(kbArticles);
  }

  const exemplars = formatMuscleMemoryExemplars(context.muscleMemoryExemplars);
  if (exemplars) {
    sections.push(exemplars);
  }

  return sections.join("\n\n");
}

function formatCaseData(caseData: CaseData): string {
  const lines = [
    `Case Number: ${caseData.case_number}`,
    `Short Description: ${sanitize(caseData.short_description)}`,
  ];

  if (caseData.description) {
    lines.push(`Detailed Description: ${sanitize(caseData.description)}`);
  }
  if (caseData.priority) {
    lines.push(`Priority: ${caseData.priority}`);
  }
  if (caseData.urgency) {
    lines.push(`Urgency: ${caseData.urgency}`);
  }
  if (caseData.current_category) {
    lines.push(`Existing Category: ${caseData.current_category}`);
  }
  if (caseData.assignment_group) {
    lines.push(`Assignment Group: ${caseData.assignment_group}`);
  }
  if (caseData.company_name || caseData.company) {
    lines.push(`Company: ${caseData.company_name || caseData.company}`);
  }

  return `CASE SNAPSHOT\n${lines.join("\n")}`;
}

function formatBusinessContext(businessContext?: BusinessEntityContext | null): string | null {
  if (!businessContext) {
    return null;
  }

  const lines: string[] = [
    `Entity: ${businessContext.entityName}`,
    businessContext.industry ? `Industry: ${businessContext.industry}` : null,
    businessContext.serviceDetails ? `Services: ${businessContext.serviceDetails}` : null,
    businessContext.technologyPortfolio ? `Tech Stack: ${businessContext.technologyPortfolio}` : null,
  ].filter(Boolean) as string[];

  if (businessContext.keyContacts && businessContext.keyContacts.length > 0) {
    const contact = businessContext.keyContacts[0];
    lines.push(`Key Contact: ${contact.name}${contact.role ? ` (${contact.role})` : ""}`);
  }

  return `BUSINESS CONTEXT\n${lines.join("\n")}`;
}

function formatSimilarCases(similarCases?: SimilarCaseResult[]): string | null {
  if (!similarCases || similarCases.length === 0) {
    return null;
  }

  const items = similarCases.slice(0, 3).map((item) => {
    const score = item.similarity_score;
    const scoreText = score ? `${Math.round(score * 100)}% match` : "";
    const desc = item.short_description || item.description || "";
    return `• ${item.case_number}${scoreText ? ` (${scoreText})` : ""} — ${sanitize(desc).slice(0, 240)}`;
  });

  return `SIMILAR CASES\n${items.join("\n")}`;
}

function formatKbArticles(kbArticles?: KBArticle[]): string | null {
  if (!kbArticles || kbArticles.length === 0) {
    return null;
  }

  const items = kbArticles.slice(0, 3).map((article) => {
    const title = article.title ? sanitize(article.title) : "KB Article";
    return `• ${article.kb_number || "KB"}: ${title.slice(0, 200)}`;
  });

  return `KB REFERENCES\n${items.join("\n")}`;
}

function formatMuscleMemoryExemplars(exemplars?: MuscleMemoryExemplarSummary[]): string | null {
  if (!exemplars || exemplars.length === 0) {
    return null;
  }

  const items = exemplars.slice(0, 3).map((exemplar) => {
    const qualityPercent = Math.round(exemplar.qualityScore * 100);
    const simPercent = exemplar.similarityScore ? Math.round(exemplar.similarityScore * 100) : null;
    const summary = sanitize(exemplar.summary);
    const action = sanitize(exemplar.actionTaken || "");

    return [
      `• Case ${exemplar.caseNumber} (quality: ${qualityPercent}%${simPercent ? `, match: ${simPercent}%` : ""})`,
      `  Summary: ${summary.slice(0, 180)}`,
      action ? `  Action: ${action.slice(0, 120)}` : null,
      exemplar.outcome ? `  Outcome: ${exemplar.outcome}` : null,
    ].filter(Boolean).join("\n");
  });

  return `MUSCLE MEMORY (Past Similar Cases)\n${items.join("\n\n")}`;
}

function sanitize(value?: string): string {
  if (!value) {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}
