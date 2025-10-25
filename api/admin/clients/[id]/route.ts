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
      return Response.json(
        { success: false, error: 'Client not found' },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('[Client Settings API] GET Error:', error);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
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

    return Response.json({
      success: true,
      data: updated,
      message: 'Client settings updated successfully',
    });
  } catch (error) {
    console.error('[Client Settings API] PATCH Error:', error);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
