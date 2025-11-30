/**
 * Prompt Duplicate API
 * Duplicate an existing prompt with a new name
 */

import { getPromptService } from "../../../../../lib/services/prompt-service";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * POST /api/admin/prompts/[id]/duplicate
 * Duplicate a prompt with a new name
 *
 * Body:
 * - newName: string (required) - The name for the duplicated prompt
 * - createdBy?: string
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    if (!body.newName || typeof body.newName !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "New name is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const service = getPromptService();
    const duplicated = await service.duplicatePrompt(
      params.id,
      body.newName.trim(),
      body.createdBy
    );

    if (!duplicated) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to duplicate. Original prompt may not exist or name already taken.",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: duplicated,
        message: "Prompt duplicated successfully",
      }),
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts Duplicate API] POST Error:", error);
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
