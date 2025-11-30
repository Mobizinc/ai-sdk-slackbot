/**
 * Business Contexts API
 * CRUD operations for managing business context entities
 */

import { getBusinessContextRepository } from "../lib/db/repositories/business-context-repository";
import type { NewBusinessContext } from "../lib/db/schema";
import { config as appConfig } from "../lib/config";

// Helper to parse query params
function getQueryParam(url: string, param: string): string | null {
  const urlObj = new URL(url);
  return urlObj.searchParams.get(param);
}

const ALLOWED_ORIGINS = [
  "https://admin.mobiz.solutions",
  "https://dev.admin.mobiz.solutions",
];

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0]; // Default to production
}

// Helper to create JSON response
function jsonResponse(request: Request, data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': getAllowedOrigin(request),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

// Security check
function checkAuth(request: Request) {
  const vercelEnv = process.env.VERCEL_ENV || appConfig.vercelEnv;
  const adminToken =
    process.env.ADMIN_API_TOKEN ||
    process.env.NEXT_PUBLIC_ADMIN_TOKEN ||
    appConfig.adminApiToken;
  const isDevelopment = !vercelEnv || vercelEnv === 'development';
  const authHeader = request.headers.get('authorization');

  if (!isDevelopment) {
    // In production, require admin token
    if (!adminToken) {
      return jsonResponse(request, {
        success: false,
        error: "Admin API is disabled in production. Set ADMIN_API_TOKEN (or NEXT_PUBLIC_ADMIN_TOKEN) to enable.",
      }, 503);
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(request, {
        success: false,
        error: "Unauthorized. Provide Bearer token in Authorization header.",
      }, 401);
    }

    const token = authHeader.substring(7);
    if (token !== adminToken) {
      return jsonResponse(request, {
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
      return jsonResponse(request, {
        success: true,
        data: contexts,
        count: contexts.length,
      });
    } else {
      // Get single context
      const context = await repository.findById(parseInt(id));

      if (!context) {
        return jsonResponse(request, {
          success: false,
          error: "Business context not found",
        }, 404);
      }

      return jsonResponse(request, {
        success: true,
        data: context,
      });
    }
  } catch (error) {
    console.error("[Business Contexts API] GET Error:", error);
    return jsonResponse(request, {
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
      return jsonResponse(request, {
        success: false,
        error: "entityName and entityType are required",
      }, 400);
    }

    // Check if entity already exists
    const existing = await repository.findByName(data.entityName);
    if (existing) {
      return jsonResponse(request, {
        success: false,
        error: `Entity "${data.entityName}" already exists. Use PUT to update.`,
      }, 409);
    }

    const created = await repository.create(data);

    return jsonResponse(request, {
      success: true,
      data: created,
      message: `Created ${data.entityName}`,
    }, 201);
  } catch (error) {
    console.error("[Business Contexts API] POST Error:", error);
    return jsonResponse(request, {
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
      return jsonResponse(request, {
        success: false,
        error: "id query parameter is required",
      }, 400);
    }

    const updates: Partial<NewBusinessContext> = await request.json();

    const existing = await repository.findById(parseInt(id));
    if (!existing) {
      return jsonResponse(request, {
        success: false,
        error: "Business context not found",
      }, 404);
    }

    const updated = await repository.update(parseInt(id), updates);

    return jsonResponse(request, {
      success: true,
      data: updated,
      message: `Updated ${existing.entityName}`,
    });
  } catch (error) {
    console.error("[Business Contexts API] PUT Error:", error);
    return jsonResponse(request, {
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
}

// OPTIONS handler - CORS preflight
export async function OPTIONS(request: Request) {
  return jsonResponse(request, { ok: true });
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
      return jsonResponse(request, {
        success: false,
        error: "id query parameter is required",
      }, 400);
    }

    const existing = await repository.findById(parseInt(id));
    if (!existing) {
      return jsonResponse(request, {
        success: false,
        error: "Business context not found",
      }, 404);
    }

    await repository.delete(parseInt(id));

    return jsonResponse(request, {
      success: true,
      message: `Deleted ${existing.entityName}`,
    });
  } catch (error) {
    console.error("[Business Contexts API] DELETE Error:", error);
    return jsonResponse(request, {
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    }, 500);
  }
}
