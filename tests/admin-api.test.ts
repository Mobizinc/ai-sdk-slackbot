/**
 * Admin API Route Tests
 * Tests for api/admin.ts endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../api/admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock path module
vi.mock('path', () => ({
  join: vi.fn(),
}));

describe('Admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('GET /api/admin', () => {
    it('should allow access in development mode without auth', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'development');
      
      const mockHtml = '<html><body>Admin Interface</body></html>';
      vi.mocked(readFileSync).mockReturnValue(mockHtml);
      vi.mocked(join).mockReturnValue('/mocked/path/admin-interface.html');

      const request = new Request('http://localhost:3000/api/admin');

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
      expect(response.headers.get('Pragma')).toBe('no-cache');
      expect(response.headers.get('Expires')).toBe('0');

      const text = await response.text();
      expect(text).toBe(mockHtml);
    });

    it('should allow access when VERCEL_ENV is not set (local development)', async () => {
      // Arrange
      delete process.env.VERCEL_ENV;
      
      const mockHtml = '<html><body>Admin Interface</body></html>';
      vi.mocked(readFileSync).mockReturnValue(mockHtml);
      vi.mocked(join).mockReturnValue('/mocked/path/admin-interface.html');

      const request = new Request('http://localhost:3000/api/admin');

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe(mockHtml);
    });

    it('should reject access in production without admin token', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'production');
      delete process.env.BUSINESS_CONTEXT_ADMIN_TOKEN;

      const request = new Request('https://app.vercel.app/api/admin');

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      
      const text = await response.text();
      expect(text).toBe('Admin interface is disabled in production. Set BUSINESS_CONTEXT_ADMIN_TOKEN to enable.');
    });

    it('should reject access with missing authorization header', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('BUSINESS_CONTEXT_ADMIN_TOKEN', 'secret-token');

      const request = new Request('https://app.vercel.app/api/admin');

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      
      const text = await response.text();
      expect(text).toBe('Unauthorized. Provide Bearer token in Authorization header.');
    });

    it('should reject access with malformed authorization header', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('BUSINESS_CONTEXT_ADMIN_TOKEN', 'secret-token');

      const request = new Request('https://app.vercel.app/api/admin', {
        headers: {
          'Authorization': 'Basic dGVzdDoxMjM=', // Basic auth instead of Bearer
        },
      });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      
      const text = await response.text();
      expect(text).toBe('Unauthorized. Provide Bearer token in Authorization header.');
    });

    it('should reject access with invalid token', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('BUSINESS_CONTEXT_ADMIN_TOKEN', 'correct-token');

      const request = new Request('https://app.vercel.app/api/admin', {
        headers: {
          'Authorization': 'Bearer wrong-token',
        },
      });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      
      const text = await response.text();
      expect(text).toBe('Forbidden. Invalid admin token.');
    });

    it('should allow access with valid Bearer token in production', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('BUSINESS_CONTEXT_ADMIN_TOKEN', 'secret-token');
      
      const mockHtml = '<html><body>Admin Interface</body></html>';
      vi.mocked(readFileSync).mockReturnValue(mockHtml);
      vi.mocked(join).mockReturnValue('/mocked/path/admin-interface.html');

      const request = new Request('https://app.vercel.app/api/admin', {
        headers: {
          'Authorization': 'Bearer secret-token',
        },
      });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/html');
      
      const text = await response.text();
      expect(text).toBe(mockHtml);
    });

    it('should handle file read errors gracefully', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'development');
      
      const fileError = new Error('ENOENT: no such file or directory');
      vi.mocked(readFileSync).mockImplementation(() => {
        throw fileError;
      });
      vi.mocked(join).mockReturnValue('/nonexistent/path/admin-interface.html');

      const request = new Request('http://localhost:3000/api/admin');

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      
      const text = await response.text();
      expect(text).toBe('Error loading admin interface');
    });

    it('should use correct file path', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'development');
      
      const mockHtml = '<html><body>Admin Interface</body></html>';
      vi.mocked(readFileSync).mockReturnValue(mockHtml);

      const request = new Request('http://localhost:3000/api/admin');

      // Act
      await GET(request);

      // Assert
      expect(join).toHaveBeenCalledWith(process.cwd(), 'admin-interface.html');
      expect(readFileSync).toHaveBeenCalledWith(expect.any(String), 'utf-8');
    });

    it('should handle different production environments', async () => {
      // Test various production-like environments
      const productionEnvs = ['production', 'preview', 'staging'];
      
      for (const env of productionEnvs) {
        vi.clearAllMocks();
        vi.stubEnv('VERCEL_ENV', env);
        vi.stubEnv('BUSINESS_CONTEXT_ADMIN_TOKEN', 'test-token');
        
        const mockHtml = '<html><body>Admin Interface</body></html>';
        vi.mocked(readFileSync).mockReturnValue(mockHtml);
        vi.mocked(join).mockReturnValue('/mocked/path/admin-interface.html');

        const request = new Request('https://app.vercel.app/api/admin', {
          headers: {
            'Authorization': 'Bearer test-token',
          },
        });

        // Act
        const response = await GET(request);

        // Assert
        expect(response.status).toBe(200);
      }
    });

    it('should trim token correctly from Bearer header', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('BUSINESS_CONTEXT_ADMIN_TOKEN', 'secret-token');
      
      const mockHtml = '<html><body>Admin Interface</body></html>';
      vi.mocked(readFileSync).mockReturnValue(mockHtml);
      vi.mocked(join).mockReturnValue('/mocked/path/admin-interface.html');

      const request = new Request('https://app.vercel.app/api/admin', {
        headers: {
          'Authorization': 'Bearer  secret-token ', // Token with extra spaces
        },
      });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(403); // Should fail because spaces are included in token
    });

    it('should handle empty token in production', async () => {
      // Arrange
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.stubEnv('BUSINESS_CONTEXT_ADMIN_TOKEN', '');

      const request = new Request('https://app.vercel.app/api/admin');

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      
      const text = await response.text();
      expect(text).toBe('Admin interface is disabled in production. Set BUSINESS_CONTEXT_ADMIN_TOKEN to enable.');
    });
  });
});