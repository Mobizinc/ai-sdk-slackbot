/**
 * Single Prompt Admin API
 * Get, update, and delete individual prompts
 */

import { getPromptService } from "../../../../lib/services/prompt-service";
import { getPromptRepository } from "../../../../lib/db/repositories/prompt-repository";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/admin/prompts/[id]
 * Get a single prompt by ID
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const repo = getPromptRepository();
    const prompt = await repo.findById(params.id);

    if (!prompt) {
      return new Response(
        JSON.stringify({ success: false, error: "Prompt not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Also fetch version history
    const versions = await repo.getVersionHistory(params.id);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...prompt,
          versionCount: versions.length,
        },
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts API] GET Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * PUT /api/admin/prompts/[id]
 * Update a prompt (full update)
 *
 * Body:
 * - content?: string
 * - description?: string
 * - variables?: string[]
 * - isActive?: boolean
 * - updatedBy?: string
 * - changeNotes?: string
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const service = getPromptService();

    const updated = await service.updatePrompt(params.id, {
      content: body.content,
      description: body.description,
      variables: body.variables,
      isActive: body.isActive,
      updatedBy: body.updatedBy,
      changeNotes: body.changeNotes,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({ success: false, error: "Prompt not found or update failed" }),
        { status: 404, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: updated,
        message: "Prompt updated successfully",
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts API] PUT Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * PATCH /api/admin/prompts/[id]
 * Partial update a prompt (same as PUT in this implementation)
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return PUT(request, { params });
}

/**
 * DELETE /api/admin/prompts/[id]
 * Soft delete (deactivate) a prompt
 *
 * Query params:
 * - hard: If "true", permanently deletes the prompt
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(request.url);
    const hardDelete = url.searchParams.get("hard") === "true";

    const service = getPromptService();

    let success: boolean;
    if (hardDelete) {
      success = await service.deletePrompt(params.id);
    } else {
      success = await service.deactivatePrompt(params.id);
    }

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, error: "Prompt not found or delete failed" }),
        { status: 404, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: hardDelete ? "Prompt permanently deleted" : "Prompt deactivated",
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts API] DELETE Error:", error);
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
