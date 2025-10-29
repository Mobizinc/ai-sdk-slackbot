/**
 * Client Settings API
 * Get and update client-specific catalog redirect settings
 */

import { getClientSettingsRepository } from '../../../../lib/db/repositories/client-settings-repository';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const repo = getClientSettingsRepository();
    const settings = await repo.getClientSettings(params.id);

    if (!settings) {
      return new Response(JSON.stringify({ success: false, error: 'Client not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: settings,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('[Client Settings API] GET Error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const repo = getClientSettingsRepository();

    // Update client settings
    await repo.upsertClientSettings({
      clientId: params.id,
      ...body,
    });

    const updated = await repo.getClientSettings(params.id);

    return new Response(JSON.stringify({
      success: true,
      data: updated,
      message: 'Client settings updated successfully',
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('[Client Settings API] PATCH Error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
