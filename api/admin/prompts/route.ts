/**
 * Prompts Admin API
 * List all prompts and create new prompts
 */

import { getPromptService } from "../../../lib/services/prompt-service";
import type { PromptType } from "../../../lib/db/repositories/prompt-repository";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/admin/prompts
 * List all prompts with optional filtering
 *
 * Query params:
 * - type: Filter by type (system, requirement, workflow, context_template, custom)
 * - isActive: Filter by active status (true/false)
 * - search: Search in name and description
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as PromptType | null;
    const isActiveParam = url.searchParams.get("isActive");
    const search = url.searchParams.get("search");

    const service = getPromptService();
    const prompts = await service.getAllPrompts({
      type: type || undefined,
      isActive: isActiveParam ? isActiveParam === "true" : undefined,
      searchTerm: search || undefined,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: prompts,
        count: prompts.length,
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts API] GET Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

/**
 * POST /api/admin/prompts
 * Create a new prompt
 *
 * Body:
 * - name: string (required, unique)
 * - type: PromptType (required)
 * - content: string (required)
 * - description?: string
 * - variables?: string[]
 * - createdBy?: string
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Name is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!body.type || typeof body.type !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Type is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const validTypes = ["system", "requirement", "workflow", "context_template", "custom"];
    if (!validTypes.includes(body.type)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!body.content || typeof body.content !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Content is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const service = getPromptService();
    const created = await service.createPrompt({
      name: body.name.trim(),
      type: body.type as PromptType,
      content: body.content,
      description: body.description,
      variables: body.variables,
      createdBy: body.createdBy,
    });

    if (!created) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create prompt. Name may already exist.",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: created,
        message: "Prompt created successfully",
      }),
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Prompts API] POST Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
