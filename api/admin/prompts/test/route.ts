/**
 * Prompt Test API
 * Test prompt variable substitution
 */

import { getPromptService } from "../../../../lib/services/prompt-service";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * POST /api/admin/prompts/test
 * Test a prompt with sample variables
 *
 * Body:
 * - promptId: string (required) - The prompt ID to test
 * - variables: Record<string, string | number | boolean> (required) - Sample variables
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.promptId || typeof body.promptId !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Prompt ID is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!body.variables || typeof body.variables !== "object") {
      return new Response(
        JSON.stringify({ success: false, error: "Variables object is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const service = getPromptService();
    const result = await service.testPrompt(body.promptId, body.variables);

    if (!result) {
      return new Response(
        JSON.stringify({ success: false, error: "Prompt not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          original: result.original,
          substituted: result.substituted,
          validation: {
            allVariables: result.validation.variables,
            hasUnsubstituted: result.validation.hasUnsubstituted,
            unsubstitutedVariables: result.validation.unsubstituted,
          },
          characterCount: {
            original: result.original.length,
            substituted: result.substituted.length,
          },
        },
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts Test API] POST Error:", error);
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
