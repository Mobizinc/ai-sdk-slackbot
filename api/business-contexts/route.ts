import { NextRequest, NextResponse } from "next/server";
import { getBusinessContextRepository } from "@/lib/db/repositories/business-context-repository";
import { NewBusinessContext } from "@/lib/db/schema";

/**
 * GET /api/business-contexts
 * List all business contexts
 */
export async function GET(request: NextRequest) {
  try {
    const repo = getBusinessContextRepository();
    const contexts = await repo.getAll();

    return NextResponse.json(contexts, { status: 200 });
  } catch (error) {
    console.error("[API] Error fetching business contexts:", error);
    return NextResponse.json(
      { error: "Failed to fetch business contexts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/business-contexts
 * Create a new business context
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const repo = getBusinessContextRepository();

    // Validate required fields
    if (!body.entityName || !body.entityType) {
      return NextResponse.json(
        { error: "Missing required fields: entityName and entityType" },
        { status: 400 }
      );
    }

    const newContext: NewBusinessContext = {
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

    const created = await repo.create(newContext);

    if (!created) {
      return NextResponse.json(
        { error: "Failed to create business context" },
        { status: 500 }
      );
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating business context:", error);
    return NextResponse.json(
      { error: "Failed to create business context" },
      { status: 500 }
    );
  }
}
