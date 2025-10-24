/**
 * Business Context Admin Interface
 * Serves the admin HTML page
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(request: Request) {
  // Security: Only allow access in development or with admin token
  const isDevelopment = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development';
  const adminToken = process.env.BUSINESS_CONTEXT_ADMIN_TOKEN;
  const authHeader = request.headers.get('authorization');

  // Allow if in development mode
  if (!isDevelopment) {
    // In production, require admin token
    if (!adminToken) {
      return new Response('Admin interface is disabled in production. Set BUSINESS_CONTEXT_ADMIN_TOKEN to enable.', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    // Check authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized. Provide Bearer token in Authorization header.', {
        status: 401,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    const token = authHeader.substring(7);
    if (token !== adminToken) {
      return new Response('Forbidden. Invalid admin token.', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
  }

  try {
    // Read the HTML file (always fresh, no caching)
    const joinedPath = join(process.cwd(), 'admin-interface.html');
    const htmlPath = joinedPath || `${process.cwd()}/admin-interface.html`;
    const html = readFileSync(htmlPath, 'utf-8');

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('[Admin Interface] Error serving HTML:', error);
    return new Response('Error loading admin interface', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}
