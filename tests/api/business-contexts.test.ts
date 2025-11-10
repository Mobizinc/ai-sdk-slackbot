/**
 * Business Contexts API Tests
 * 
 * Critical security and functionality tests for Business Contexts CRUD API
 * Tests authentication, authorization, input validation, and data security
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST, PUT, DELETE, OPTIONS } from "../../api/business-contexts";
import { getBusinessContextRepository } from "../../lib/db/repositories/business-context-repository";

// Mock dependencies
vi.mock("../../lib/db/repositories/business-context-repository", () => ({
  getBusinessContextRepository: vi.fn(),
}));

vi.mock("../../lib/config", () => ({
  config: {
    vercelEnv: "test",
    adminApiToken: "test-admin-token",
  },
}));

describe("Business Contexts API", () => {
  let mockRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = {
      getAllActive: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    vi.mocked(getBusinessContextRepository).mockReturnValue(mockRepository);
  });

  describe("Authentication & Authorization", () => {
    it("should reject requests without authorization header", async () => {
      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
      });

      const response = await GET(request);
      
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Unauthorized");
    });

    it("should reject requests with invalid Bearer token", async () => {
      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
        headers: {
          "authorization": "Bearer invalid-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("Forbidden");
    });

    it("should reject requests with malformed authorization header", async () => {
      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
        headers: {
          "authorization": "InvalidFormat token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Unauthorized");
    });

    it("should allow requests with valid Bearer token", async () => {
      mockRepository.getAllActive.mockResolvedValue([]);

      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(200);
      expect(mockRepository.getAllActive).toHaveBeenCalled();
    });
  });

  describe("GET Operations", () => {
    it("should list all active business contexts", async () => {
      const mockContexts = [
        {
          id: 1,
          entityName: "Test Client",
          entityType: "CLIENT",
          industry: "Technology",
          description: "Test description",
          isActive: true,
        },
      ];

      mockRepository.getAllActive.mockResolvedValue(mockContexts);

      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockContexts);
      expect(body.count).toBe(1);
    });

    it("should get single business context by ID", async () => {
      const mockContext = {
        id: 1,
        entityName: "Test Client",
        entityType: "CLIENT",
        industry: "Technology",
        description: "Test description",
        isActive: true,
      };

      mockRepository.findById.mockResolvedValue(mockContext);

      const request = new Request("https://example.com/api/business-contexts?id=1", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockContext);
      expect(mockRepository.findById).toHaveBeenCalledWith(1);
    });

    it("should return 404 for non-existent context", async () => {
      mockRepository.findById.mockResolvedValue(null);

      const request = new Request("https://example.com/api/business-contexts?id=999", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("not found");
    });

    it("should handle database errors gracefully", async () => {
      mockRepository.getAllActive.mockRejectedValue(new Error("Database connection failed"));

      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Database connection failed");
    });

    it("should handle invalid ID parameter", async () => {
      const request = new Request("https://example.com/api/business-contexts?id=invalid", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  describe("POST Operations", () => {
    it("should create new business context with valid data", async () => {
      const newContext = {
        entityName: "New Client",
        entityType: "CLIENT",
        industry: "Finance",
        description: "A new client",
      };

      const now = new Date();
      const createdContext = {
        id: 2,
        ...newContext,
        isActive: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue(createdContext);

      const request = new Request("https://example.com/api/business-contexts", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(newContext),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(createdContext);
      expect(body.message).toContain("Created New Client");
      expect(mockRepository.create).toHaveBeenCalledWith(newContext);
    });

    it("should reject creation with missing required fields", async () => {
      const invalidContext = {
        industry: "Finance",
        description: "Missing entityName and entityType",
      };

      const request = new Request("https://example.com/api/business-contexts", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(invalidContext),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("entityName and entityType are required");
    });

    it("should reject creation of duplicate entity", async () => {
      const existingContext = {
        entityName: "Existing Client",
        entityType: "CLIENT",
      };

      const duplicateContext = {
        entityName: "Existing Client",
        entityType: "CLIENT",
      };

      mockRepository.findByName.mockResolvedValue(existingContext as any);

      const request = new Request("https://example.com/api/business-contexts", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(duplicateContext),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("already exists");
      expect(body.error).toContain("Use PUT to update");
    });

    it("should handle invalid JSON in request body", async () => {
      const request = new Request("https://example.com/api/business-contexts", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: "invalid json",
      });

      const response = await POST(request);
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Unexpected token");
    });

    it("should document lack of input sanitization", async () => {
      const maliciousContext = {
        entityName: "<script>alert('xss')</script>",
        entityType: "CLIENT",
        description: "<img src=x onerror=alert('xss')>",
      };

      const sanitizedContext = {
        id: 3,
        entityName: "<script>alert('xss')</script>", // API doesn't sanitize, test documents this
        entityType: "CLIENT",
        description: "<img src=x onerror=alert('xss')>",
        isActive: true,
      };

      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue(sanitizedContext);

      const request = new Request("https://example.com/api/business-contexts", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(maliciousContext),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(201);
      // Note: This test documents that input sanitization is NOT implemented
      // This is a security vulnerability that should be addressed
    });
  });

  describe("PUT Operations", () => {
    it("should update existing business context", async () => {
      const existingContext = {
        id: 1,
        entityName: "Old Name",
        entityType: "CLIENT",
        industry: "Technology",
      };

      const updates = {
        entityName: "Updated Name",
        industry: "Finance",
      };

      const updatedContext = {
        ...existingContext,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      mockRepository.findById.mockResolvedValue(existingContext);
      mockRepository.update.mockResolvedValue(updatedContext);

      const request = new Request("https://example.com/api/business-contexts?id=1", {
        method: "PUT",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      const response = await PUT(request);
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(updatedContext);
      expect(body.message).toContain("Updated Old Name");
      expect(mockRepository.update).toHaveBeenCalledWith(1, updates);
    });

    it("should reject update without ID parameter", async () => {
      const updates = {
        entityName: "Updated Name",
      };

      const request = new Request("https://example.com/api/business-contexts", {
        method: "PUT",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      const response = await PUT(request);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("id query parameter is required");
    });

    it("should return 404 when updating non-existent context", async () => {
      mockRepository.findById.mockResolvedValue(null);

      const updates = {
        entityName: "Updated Name",
      };

      const request = new Request("https://example.com/api/business-contexts?id=999", {
        method: "PUT",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      const response = await PUT(request);
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("not found");
    });

    it("should handle invalid ID parameter", async () => {
      const updates = {
        entityName: "Updated Name",
      };

      const request = new Request("https://example.com/api/business-contexts?id=invalid", {
        method: "PUT",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      const response = await PUT(request);
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  describe("DELETE Operations", () => {
    it("should delete existing business context", async () => {
      const existingContext = {
        id: 1,
        entityName: "Client To Delete",
        entityType: "CLIENT",
      };

      mockRepository.findById.mockResolvedValue(existingContext);
      mockRepository.delete.mockResolvedValue(true);

      const request = new Request("https://example.com/api/business-contexts?id=1", {
        method: "DELETE",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await DELETE(request);
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain("Deleted Client To Delete");
      expect(mockRepository.delete).toHaveBeenCalledWith(1);
    });

    it("should reject delete without ID parameter", async () => {
      const request = new Request("https://example.com/api/business-contexts", {
        method: "DELETE",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await DELETE(request);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("id query parameter is required");
    });

    it("should return 404 when deleting non-existent context", async () => {
      mockRepository.findById.mockResolvedValue(null);

      const request = new Request("https://example.com/api/business-contexts?id=999", {
        method: "DELETE",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await DELETE(request);
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("not found");
    });

    it("should handle database errors during deletion", async () => {
      const existingContext = {
        id: 1,
        entityName: "Client To Delete",
        entityType: "CLIENT",
      };

      mockRepository.findById.mockResolvedValue(existingContext);
      mockRepository.delete.mockRejectedValue(new Error("Foreign key constraint"));

      const request = new Request("https://example.com/api/business-contexts?id=1", {
        method: "DELETE",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await DELETE(request);
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Foreign key constraint");
    });
  });

  describe("CORS Support", () => {
    it("should handle OPTIONS preflight requests with default origin", async () => {
      const request = new Request("https://example.com/api/business-contexts", {
        method: "OPTIONS",
      });

      const response = await OPTIONS(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.mobiz.solutions');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });

    it("should handle OPTIONS preflight requests with matching origin", async () => {
      const request = new Request("https://example.com/api/business-contexts", {
        method: "OPTIONS",
        headers: {
          "origin": "https://dev.admin.mobiz.solutions",
        },
      });

      const response = await OPTIONS(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://dev.admin.mobiz.solutions');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });

    it("should include CORS headers in all responses", async () => {
      mockRepository.getAllActive.mockResolvedValue([]);

      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.mobiz.solutions');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });

    it("should use default origin for non-whitelisted origin", async () => {
      mockRepository.getAllActive.mockResolvedValue([]);

      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
          "origin": "https://evil.com",
        },
      });

      const response = await GET(request);

      // Should fall back to default origin, not echo the evil origin
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.mobiz.solutions');
    });
  });

  describe("Input Validation & Security", () => {
    it("should handle oversized payloads", async () => {
      const largePayload = {
        entityName: "Large Client",
        entityType: "CLIENT",
        description: "a".repeat(1000000), // 1MB description
      };

      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue({ id: 1, ...largePayload });

      const request = new Request("https://example.com/api/business-contexts", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(largePayload),
      });

      // API doesn't currently implement size limits, so it should succeed
      // This test documents current behavior
      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it("should handle special characters in entity names", async () => {
      const specialContext = {
        entityName: "Client & Co. LLC",
        entityType: "CLIENT",
        description: "Special chars: @#$%^&*()",
      };

      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue({ id: 1, ...specialContext });

      const request = new Request("https://example.com/api/business-contexts", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(specialContext),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it("should document lack of entity type validation", async () => {
      const invalidContext = {
        entityName: "Test Client",
        entityType: "INVALID_TYPE", // Should be CLIENT, VENDOR, or PLATFORM
      };

      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue({ id: 1, ...invalidContext });

      const request = new Request("https://example.com/api/business-contexts", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(invalidContext),
      });

      // API doesn't validate entity type, this documents the issue
      const response = await POST(request);
      expect(response.status).toBe(201);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository errors consistently", async () => {
      mockRepository.getAllActive.mockRejectedValue(new Error("Connection timeout"));

      const request = new Request("https://example.com/api/business-contexts", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Connection timeout");
    });

    it("should handle malformed query parameters", async () => {
      const request = new Request("https://example.com/api/business-contexts?id[]=1&id[]=2", {
        method: "GET",
        headers: {
          "authorization": "Bearer test-admin-token",
        },
      });

      const response = await GET(request);
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });
});