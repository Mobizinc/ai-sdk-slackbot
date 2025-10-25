/**
 * Catalog Redirect Analytics API
 * Returns redirect metrics and trends
 */

import { getClientSettingsRepository } from '../../../lib/db/repositories/client-settings-repository';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get('clientId');
    const days = parseInt(url.searchParams.get('days') || '30');

    const repo = getClientSettingsRepository();

    if (clientId) {
      // Get metrics for specific client
      const metrics = await repo.getRedirectMetrics(clientId, days);
      return new Response(JSON.stringify(metrics), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Get all clients with redirect enabled
    const enabledClients = await repo.getClientsWithRedirectEnabled();

    // Get metrics for all enabled clients
    const allMetrics = await Promise.all(
      enabledClients.map(async (client) => {
        const metrics = await repo.getRedirectMetrics(client.clientId, days);
        return {
          ...metrics,
          clientId: client.clientId,
          clientName: client.clientName,
        };
      })
    );

    return new Response(JSON.stringify({
      clients: enabledClients.map(c => ({
        clientId: c.clientId,
        clientName: c.clientName,
      })),
      metrics: allMetrics,
      timeRange: `${days} days`,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('[Catalog Redirects API] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
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
