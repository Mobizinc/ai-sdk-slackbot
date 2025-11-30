/**
 * Prompt Stats API
 * Get statistics about prompts and cache
 */

import { getPromptService } from "../../../../lib/services/prompt-service";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/admin/prompts/stats
 * Get prompt statistics
 */
export async function GET() {
  try {
    const service = getPromptService();
    const stats = await service.getStats();

    return new Response(
      JSON.stringify({
        success: true,
        data: stats,
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts Stats API] GET Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
