/**
 * Clients Admin API
 * List all clients with catalog redirect settings
 */

import { getClientSettingsRepository } from '../../../lib/db/repositories/client-settings-repository';

export async function GET() {
  try {
    const repo = getClientSettingsRepository();
    const allClients = await repo.getAllClientSettings();

    return Response.json({
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
    });
  } catch (error) {
    console.error('[Clients API] Error:', error);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
