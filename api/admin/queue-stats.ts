/**
 * Queue Statistics & Observability Endpoint
 * Provides visibility into async queue health and performance
 *
 * Usage: GET /api/admin/queue-stats
 *
 * Returns:
 * - Queue configuration status
 * - Recent processing metrics
 * - Error/retry statistics
 * - Performance trends
 */

import { getCaseClassificationRepository } from '../../lib/db/repositories/case-classification-repository';
import { isQStashEnabled, getSigningKeys } from '../../lib/queue/qstash-client';
import { config as appConfig } from '../../lib/config';
/**
 * Get queue statistics
 */
export async function GET(request: Request) {
  try {
    const repository = getCaseClassificationRepository();
    const enableAsyncTriage = appConfig.enableAsyncTriage;
    const authHeader = request.headers.get('authorization');
    const adminKey = appConfig.adminApiKey;

    // Simple API key auth (optional - remove if not needed)
    if (adminKey && authHeader !== `Bearer ${adminKey}`) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get classification stats from DB
    const stats7d = await repository.getClassificationStats(7);
    const stats1d = await repository.getClassificationStats(1);

    // Get recent classifications
    const recentResults = await repository.getRecentClassifications(20);

    // Calculate async-specific metrics
    const processingTimes = recentResults.map(r => r.processingTimeMs);
    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;

    const maxProcessingTime = processingTimes.length > 0
      ? Math.max(...processingTimes)
      : 0;

    const minProcessingTime = processingTimes.length > 0
      ? Math.min(...processingTimes)
      : 0;

    // Check for failures (processing time = -1 or very low confidence)
    const failures = recentResults.filter(
      r => r.processingTimeMs < 0 || r.confidenceScore < 0.3
    );

    const signingKeys = getSigningKeys();

    return Response.json({
      queue_config: {
        async_triage_enabled: enableAsyncTriage,
        qstash_enabled: isQStashEnabled(),
        qstash_configured: !!(signingKeys.current && signingKeys.next),
        worker_url: appConfig.vercelUrl || 'localhost:3000',
      },
      stats_7d: {
        total_classifications: stats7d.totalClassifications,
        average_processing_time_ms: Math.round(stats7d.averageProcessingTime),
        average_confidence: Math.round(stats7d.averageConfidence * 100),
        top_workflows: stats7d.topWorkflows,
      },
      stats_24h: {
        total_classifications: stats1d.totalClassifications,
        average_processing_time_ms: Math.round(stats1d.averageProcessingTime),
        average_confidence: Math.round(stats1d.averageConfidence * 100),
      },
      recent_performance: {
        sample_size: recentResults.length,
        avg_processing_time_ms: Math.round(avgProcessingTime),
        min_processing_time_ms: Math.round(minProcessingTime),
        max_processing_time_ms: Math.round(maxProcessingTime),
        failure_count: failures.length,
        failure_rate: recentResults.length > 0
          ? Math.round((failures.length / recentResults.length) * 100)
          : 0,
      },
      recent_classifications: recentResults.slice(0, 5).map(r => ({
        case_number: r.caseNumber,
        workflow_id: r.workflowId,
        processing_time_ms: r.processingTimeMs,
        confidence_score: Math.round(r.confidenceScore * 100),
        classified_at: r.createdAt.toISOString(),
        age_minutes: Math.round((Date.now() - r.createdAt.getTime()) / 60000),
      })),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Queue Stats] Error fetching statistics:', error);
    return Response.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
