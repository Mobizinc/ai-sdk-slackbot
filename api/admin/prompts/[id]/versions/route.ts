/**
 * Prompt Versions Admin API
 * View version history and rollback to previous versions
 */

import { getPromptService } from "../../../../../lib/services/prompt-service";
import { getPromptRepository } from "../../../../../lib/db/repositories/prompt-repository";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/admin/prompts/[id]/versions
 * Get version history for a prompt
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const service = getPromptService();
    const versions = await service.getVersionHistory(params.id);

    if (versions.length === 0) {
      // Check if prompt exists
      const repo = getPromptRepository();
      const prompt = await repo.findById(params.id);
      if (!prompt) {
        return new Response(
          JSON.stringify({ success: false, error: "Prompt not found" }),
          { status: 404, headers: corsHeaders }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: versions,
        count: versions.length,
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts Versions API] GET Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/admin/prompts/[id]/versions
 * Rollback to a specific version
 *
 * Body:
 * - version: number (required) - The version number to rollback to
 * - updatedBy?: string
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    if (typeof body.version !== "number") {
      return new Response(
        JSON.stringify({ success: false, error: "Version number is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const service = getPromptService();
    const updated = await service.rollbackToVersion(
      params.id,
      body.version,
      body.updatedBy
    );

    if (!updated) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Prompt or version not found",
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: updated,
        message: `Rolled back to version ${body.version}`,
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts Versions API] POST Error:", error);
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
