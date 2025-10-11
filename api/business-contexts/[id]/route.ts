import { NextRequest, NextResponse } from "next/server";
import { getBusinessContextRepository } from "@/lib/db/repositories/business-context-repository";
import { NewBusinessContext } from "@/lib/db/schema";

/**
 * GET /api/business-contexts/:id
 * Get a single business context by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contextId = parseInt(params.id, 10);

    if (isNaN(contextId)) {
      return NextResponse.json(
        { error: "Invalid context ID" },
        { status: 400 }
      );
    }

    const repo = getBusinessContextRepository();
    const context = await repo.findById(contextId);

    if (!context) {
      return NextResponse.json(
        { error: "Business context not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(context, { status: 200 });
  } catch (error) {
    console.error(`[API] Error fetching business context ${params.id}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch business context" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/business-contexts/:id
 * Update a business context
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contextId = parseInt(params.id, 10);

    if (isNaN(contextId)) {
      return NextResponse.json(
        { error: "Invalid context ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const repo = getBusinessContextRepository();

    // Check if context exists
    const existing = await repo.findById(contextId);
    if (!existing) {
      return NextResponse.json(
        { error: "Business context not found" },
        { status: 404 }
      );
    }

    const updates: Partial<NewBusinessContext> = {
      entityName: body.entityName,
      entityType: body.entityType,
      industry: body.industry || null,
      description: body.description || null,
      aliases: body.aliases || [],
      relatedEntities: body.relatedEntities || [],
      technologyPortfolio: body.technologyPortfolio || null,
      serviceDetails: body.serviceDetails || null,
      keyContacts: body.keyContacts || [],
      slackChannels: body.slackChannels || [],
      cmdbIdentifiers: body.cmdbIdentifiers || [],
      contextStewards: body.contextStewards || [],
      isActive: body.isActive !== undefined ? body.isActive : true,
    };

    const updated = await repo.update(contextId, updates);

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update business context" },
        { status: 500 }
      );
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error(`[API] Error updating business context ${params.id}:`, error);
    return NextResponse.json(
      { error: "Failed to update business context" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/business-contexts/:id
 * Delete a business context permanently
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contextId = parseInt(params.id, 10);

    if (isNaN(contextId)) {
      return NextResponse.json(
        { error: "Invalid context ID" },
        { status: 400 }
      );
    }

    const repo = getBusinessContextRepository();

    // Check if context exists
    const existing = await repo.findById(contextId);
    if (!existing) {
      return NextResponse.json(
        { error: "Business context not found" },
        { status: 404 }
      );
    }

    const deleted = await repo.delete(contextId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete business context" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Business context deleted" },
      { status: 200 }
    );
  } catch (error) {
    console.error(`[API] Error deleting business context ${params.id}:`, error);
    return NextResponse.json(
      { error: "Failed to delete business context" },
      { status: 500 }
    );
  }
}
