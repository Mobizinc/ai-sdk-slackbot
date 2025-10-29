/**
 * Clients Admin API
 * List all clients with catalog redirect settings
 */

import { getClientSettingsRepository } from '../../../lib/db/repositories/client-settings-repository';

export async function GET() {
  try {
    const repo = getClientSettingsRepository();
    const allClients = await repo.getAllClientSettings();

    return new Response(JSON.stringify({
      success: true,
      data: allClients.map(client => ({
        id: client.id,
        clientId: client.clientId,
        clientName: client.clientName,
        catalogRedirectEnabled: client.catalogRedirectEnabled,
        catalogRedirectConfidenceThreshold: client.catalogRedirectConfidenceThreshold,
        catalogRedirectAutoClose: client.catalogRedirectAutoClose,
        supportContactInfo: client.supportContactInfo,
        customMappingsCount: client.customCatalogMappings?.length || 0,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      })),
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('[Clients API] Error:', error);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
