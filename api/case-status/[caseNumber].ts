/**
 * Case Status Endpoint (Optional Polling Interface)
 * Allows ServiceNow or other systems to poll for classification results
 *
 * Usage: GET /api/case-status/SCS0048870
 *
 * Returns:
 * - 200: Classification complete (with results)
 * - 202: Processing in progress
 * - 404: Case not found
 */

import { getCaseClassificationRepository } from '../../lib/db/repositories/case-classification-repository';

const repository = getCaseClassificationRepository();

export async function GET(
  request: Request,
  { params }: { params: { caseNumber: string } }
) {
  try {
    const { caseNumber } = params;

    if (!caseNumber) {
      return Response.json(
        { error: 'Case number is required' },
        { status: 400 }
      );
    }

    // Get latest classification result
    const result = await repository.getLatestClassificationResult(caseNumber);

    if (!result) {
      return Response.json(
        {
          status: 'not_found',
          case_number: caseNumber,
          message: 'No classification found for this case',
        },
        { status: 404 }
      );
    }

    // Check if recently classified
    const ageMinutes = (Date.now() - result.createdAt.getTime()) / 60000;
    const isRecent = ageMinutes < 15; // Within last 15 minutes

    // Return classification result
    return Response.json({
      status: 'completed',
      case_number: caseNumber,
      classified_at: result.createdAt.toISOString(),
      age_minutes: Math.round(ageMinutes),
      is_recent: isRecent,
      workflow_id: result.workflowId,
      classification: {
        category: (result.classificationJson as any).category,
        subcategory: (result.classificationJson as any).subcategory,
        confidence_score: (result.classificationJson as any).confidence_score,
        reasoning: (result.classificationJson as any).reasoning,
        quick_summary: (result.classificationJson as any).quick_summary,
        immediate_next_steps: (result.classificationJson as any).immediate_next_steps,
        record_type_suggestion: (result.classificationJson as any).record_type_suggestion,
      },
      processing_time_ms: result.processingTimeMs,
      servicenow_updated: result.servicenowUpdated,
      entities_count: result.entitiesCount,
    });

  } catch (error) {
    console.error('[Case Status] Error fetching status:', error);
    return Response.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
