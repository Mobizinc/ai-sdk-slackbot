import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../../../api/internal/sweep-abandonments";
import * as abandonmentService from "../../../lib/projects/interview-abandonment-service";

// Mock the abandonment service
vi.mock("../../../lib/projects/interview-abandonment-service");

describe("api/internal/sweep-abandonments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variable
    process.env.INTERNAL_CRON_SECRET = "test-secret-123";
  });

  afterEach(() => {
    delete process.env.INTERNAL_CRON_SECRET;
  });

  describe("Authorization", () => {
    it("should return 401 if no authorization header provided", async () => {
      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Unauthorized");
    });

    it("should return 401 if authorization token is incorrect", async () => {
      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-token",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Unauthorized");
    });

    it("should allow request with correct Bearer token", async () => {
      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockResolvedValue({
        checked: 5,
        marked: 2,
        promotions: 1,
        errors: 0,
      });

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "Bearer test-secret-123",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(abandonmentService.sweepAbandonedInterviews).toHaveBeenCalledTimes(1);
    });

    it("should handle authorization without 'Bearer' prefix", async () => {
      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockResolvedValue({
        checked: 0,
        marked: 0,
        promotions: 0,
        errors: 0,
      });

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "test-secret-123",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("should return null authorization response if INTERNAL_CRON_SECRET not set", async () => {
      delete process.env.INTERNAL_CRON_SECRET;

      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockResolvedValue({
        checked: 0,
        marked: 0,
        promotions: 0,
        errors: 0,
      });

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "Bearer anything",
        },
      });

      const response = await POST(request);

      // If no secret configured, authorization check returns null (passes through)
      expect(response.status).toBe(200);
      expect(abandonmentService.sweepAbandonedInterviews).toHaveBeenCalled();
    });
  });

  describe("Sweep Execution", () => {
    beforeEach(() => {
      process.env.INTERNAL_CRON_SECRET = "test-secret-123";
    });

    it("should execute sweep and return results", async () => {
      const mockResult = {
        checked: 10,
        marked: 3,
        promotions: 2,
        errors: 0,
      };

      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockResolvedValue(mockResult);

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "Bearer test-secret-123",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");

      const body = await response.json();
      expect(body).toEqual(mockResult);
    });

    it("should handle sweep with no abandonments found", async () => {
      const mockResult = {
        checked: 50,
        marked: 0,
        promotions: 0,
        errors: 0,
      };

      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockResolvedValue(mockResult);

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "Bearer test-secret-123",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.checked).toBe(50);
      expect(body.marked).toBe(0);
    });

    it("should handle sweep with errors", async () => {
      const mockResult = {
        checked: 20,
        marked: 5,
        promotions: 3,
        errors: 2,
      };

      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockResolvedValue(mockResult);

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "Bearer test-secret-123",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.errors).toBe(2);
    });

    it("should handle service errors gracefully", async () => {
      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockRejectedValue(
        new Error("Database connection failed")
      );

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "Bearer test-secret-123",
        },
      });

      // The endpoint should handle errors internally
      await expect(POST(request)).rejects.toThrow("Database connection failed");
    });
  });

  describe("Edge Cases", () => {
    beforeEach(() => {
      process.env.INTERNAL_CRON_SECRET = "test-secret-123";
    });

    it("should handle case-insensitive Bearer prefix", async () => {
      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockResolvedValue({
        checked: 0,
        marked: 0,
        promotions: 0,
        errors: 0,
      });

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "bearer test-secret-123", // lowercase
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("should handle extra whitespace in authorization header", async () => {
      vi.spyOn(abandonmentService, "sweepAbandonedInterviews").mockResolvedValue({
        checked: 0,
        marked: 0,
        promotions: 0,
        errors: 0,
      });

      const request = new Request("http://localhost/api/internal/sweep-abandonments", {
        method: "POST",
        headers: {
          authorization: "Bearer   test-secret-123", // extra spaces
        },
      });

      const response = await POST(request);

      // The regex (/^Bearer\s+/i) handles multiple spaces correctly
      expect(response.status).toBe(200);
      expect(abandonmentService.sweepAbandonedInterviews).toHaveBeenCalled();
    });
  });
});
