/**
 * Business Contexts API
 * CRUD operations for managing business context entities
 */

import { getBusinessContextRepository } from "../lib/db/repositories/business-context-repository";
import type { NewBusinessContext } from "../lib/db/schema";

// Helper to parse query params
function getQueryParam(url: string, param: string): string | null {
  const urlObj = new URL(url);
  return urlObj.searchParams.get(param);
}

// Helper to create JSON response
function jsonResponse(data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// Security check
function checkAuth(request: Request) {
  const isDevelopment = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development';
  const adminToken = process.env.BUSINESS_CONTEXT_ADMIN_TOKEN;
  const authHeader = request.headers.get('authorization');

  if (!isDevelopment) {
    // In production, require admin token
    if (!adminToken) {
      return jsonResponse({
        success: false,
        error: "Business Context Admin API is disabled in production. Set BUSINESS_CONTEXT_ADMIN_TOKEN to enable.",
      }, 503);
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({
        success: false,
        error: "Unauthorized. Provide Bearer token in Authorization header.",
      }, 401);
    }

    const token = authHeader.substring(7);
    if (token !== adminToken) {
      return jsonResponse({
        success: false,
        error: "Forbidden. Invalid admin token.",
      }, 403);
    }
  }

  return null; // Auth passed
}

// GET handler - List all or get single context
export async function GET(request: Request) {
  // Check authentication
  const authError = checkAuth(request);
  if (authError) return authError;

  const repository = getBusinessContextRepository();

  try {
    const id = getQueryParam(request.url, 'id');

    if (!id) {
      // List all contexts
      const contexts = await repository.getAllActive();
      return jsonResponse({
        success: true,
        data: contexts,
        count: contexts.length,
      });
    } else {
      // Get single context
      const context = await repository.findById(parseInt(id));

      if (!context) {
        return jsonResponse({
          success: false,
          error: "Business context not found",
        }, 404);
      }

      return jsonResponse({
        success: true,
        data: context,
      });
    }
  } catch (error) {
    console.error("[Business Contexts API] GET Error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
}

// POST handler - Create new context
export async function POST(request: Request) {
  // Check authentication
  const authError = checkAuth(request);
  if (authError) return authError;

  const repository = getBusinessContextRepository();

  try {
    const data: NewBusinessContext = await request.json();

    // Validate required fields
    if (!data.entityName || !data.entityType) {
      return jsonResponse({
        success: false,
        error: "entityName and entityType are required",
      }, 400);
    }

    // Check if entity already exists
    const existing = await repository.findByName(data.entityName);
    if (existing) {
      return jsonResponse({
        success: false,
        error: `Entity "${data.entityName}" already exists. Use PUT to update.`,
      }, 409);
    }

    const created = await repository.create(data);

    return jsonResponse({
      success: true,
      data: created,
      message: `Created ${data.entityName}`,
    }, 201);
  } catch (error) {
    console.error("[Business Contexts API] POST Error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
}

// PUT handler - Update context
export async function PUT(request: Request) {
  // Check authentication
  const authError = checkAuth(request);
  if (authError) return authError;

  const repository = getBusinessContextRepository();

  try {
    const id = getQueryParam(request.url, 'id');
    if (!id) {
      return jsonResponse({
        success: false,
        error: "id query parameter is required",
      }, 400);
    }

    const updates: Partial<NewBusinessContext> = await request.json();

    const existing = await repository.findById(parseInt(id));
    if (!existing) {
      return jsonResponse({
        success: false,
        error: "Business context not found",
      }, 404);
    }

    const updated = await repository.update(parseInt(id), updates);

    return jsonResponse({
      success: true,
      data: updated,
      message: `Updated ${existing.entityName}`,
    });
  } catch (error) {
    console.error("[Business Contexts API] PUT Error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
}

// OPTIONS handler - CORS preflight
export async function OPTIONS(request: Request) {
  return jsonResponse({ ok: true });
}

// DELETE handler - Delete context
export async function DELETE(request: Request) {
  // Check authentication
  const authError = checkAuth(request);
  if (authError) return authError;

  const repository = getBusinessContextRepository();

  try {
    const id = getQueryParam(request.url, 'id');
    if (!id) {
      return jsonResponse({
        success: false,
        error: "id query parameter is required",
      }, 400);
    }

    const existing = await repository.findById(parseInt(id));
    if (!existing) {
      return jsonResponse({
        success: false,
        error: "Business context not found",
      }, 404);
    }

    await repository.delete(parseInt(id));

    return jsonResponse({
      success: true,
      message: `Deleted ${existing.entityName}`,
    });
  } catch (error) {
    console.error("[Business Contexts API] DELETE Error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
}
